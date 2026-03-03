import { run, user } from '@openai/agents';
import { setDefaultOpenAIClient } from '@openai/agents-openai';
import OpenAI from 'openai';
import type { MCPServer } from '@openai/agents';
import { createHeartbeatAgent } from './agent';
import { getConfig } from './config';
import { tracer } from '../telemetry/tracer';
import { LLM_ATTRS, HEARTBEAT_ATTRS } from '../telemetry/semantics';
import { addHeartbeatResult, getAllTaskLastRun, updateTaskLastRun, batchUpdateTaskLastRun, loadHeartbeatState } from '../store/heartbeatStore';
import type { HeartbeatConfig, HeartbeatResult, HeartbeatTask } from '../types';

export type HeartbeatNotification = {
  results: HeartbeatResult[];
};

type Listener = (notification: HeartbeatNotification) => void;

/** タスクを allowedMcpTools の内容でグループ化する */
export function groupTasksByMcpTools(
  tasks: HeartbeatTask[],
): Array<{ tasks: HeartbeatTask[]; allowedMcpTools: string[] }> {
  const map = new Map<string, { tasks: HeartbeatTask[]; allowedMcpTools: string[] }>();
  for (const task of tasks) {
    const tools = [...(task.allowedMcpTools ?? [])].sort();
    const key = tools.join('\0');
    const existing = map.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      map.set(key, { tasks: [task], allowedMcpTools: tools });
    }
  }
  return [...map.values()];
}

/** 現在がサイレント時間帯かどうかを判定する */
export function isQuietHours(config: HeartbeatConfig, now?: Date): boolean {
  const current = now ?? new Date();
  const hour = current.getHours();
  const day = current.getDay(); // 0=日曜...6=土曜

  // 曜日チェック（quietDays 未定義でも安全）
  if (config.quietDays?.includes(day)) {
    return true;
  }

  // 時間帯チェック（既存ロジック）
  const { quietHoursStart, quietHoursEnd } = config;
  if (quietHoursStart <= quietHoursEnd) {
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }
  // 例: 23時〜6時のように日をまたぐ場合
  return hour >= quietHoursStart || hour < quietHoursEnd;
}

/** 今日の通知数（hasChanges=true の結果）をカウントする */
export function getTodayNotificationCount(results: HeartbeatResult[], now?: Date): number {
  const current = now ?? new Date();
  const todayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  return results.filter(r => r.timestamp >= todayStart && r.hasChanges).length;
}

/** タスクごとのスケジュールを評価し、実行すべきタスクを返す */
export async function getTasksDue(config: HeartbeatConfig): Promise<HeartbeatTask[]> {
  const now = Date.now();
  const currentDate = new Date();
  const currentHour = currentDate.getHours();
  const currentMinute = currentDate.getMinutes();
  const enabledTasks = config.tasks.filter((t) => t.enabled);
  const dueTasks: HeartbeatTask[] = [];

  // state を1回ロードして全タスクの lastRun を参照（N+1 防止）
  const taskLastRunMap = await getAllTaskLastRun();

  for (const task of enabledTasks) {
    const schedule = task.schedule;
    const lastRun = taskLastRunMap[task.id] ?? 0;

    if (!schedule || schedule.type === 'global') {
      // グローバル間隔: taskLastRun で個別追跡（飢餓防止）
      const intervalMs = config.intervalMinutes * 60_000;
      if (now - lastRun >= intervalMs) {
        dueTasks.push(task);
      }
    } else if (schedule.type === 'interval') {
      // タスク独自間隔
      const intervalMs = (schedule.intervalMinutes ?? config.intervalMinutes) * 60_000;
      if (now - lastRun >= intervalMs) {
        dueTasks.push(task);
      }
    } else if (schedule.type === 'fixed-time') {
      // 固定時刻: 対象時刻を過ぎていて今日まだ未実行（±1分ウィンドウだと見逃す可能性があるため）
      const targetHour = schedule.hour ?? 8;
      const targetMinute = schedule.minute ?? 0;
      const currentTotalMinutes = currentHour * 60 + currentMinute;
      const targetTotalMinutes = targetHour * 60 + targetMinute;
      if (currentTotalMinutes >= targetTotalMinutes) {
        const todayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
        if (lastRun < todayStart) {
          dueTasks.push(task);
        }
      }
    }
  }

  return dueTasks;
}

export class HeartbeatEngine {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private isAgentBusy = false;
  private isExecuting = false;
  private listeners: Listener[] = [];
  private getMCPServers: () => MCPServer[];

  constructor(getMCPServers: () => MCPServer[]) {
    this.getMCPServers = getMCPServers;
  }

  start(): void {
    if (this.timerId) return;
    this.isRunning = true;
    // 1分間隔でtick。各タスクの経過時間で実行判定
    this.timerId = setInterval(() => this.tick(), 60_000);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  setAgentBusy(busy: boolean): void {
    this.isAgentBusy = busy;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** フォアグラウンド復帰時などに即座にチェック */
  async runNow(): Promise<void> {
    await this.tick();
  }

  private notify(notification: HeartbeatNotification): void {
    for (const listener of this.listeners) {
      listener(notification);
    }
  }

  private async tick(): Promise<void> {
    if (!this.isRunning || this.isAgentBusy || this.isExecuting) return;

    const config = getConfig().heartbeat;
    if (!config || !config.enabled) return;
    if (isQuietHours(config)) return;
    if (config.focusMode) {
      console.debug('[Heartbeat] フォーカスモード中 — スキップ');
      return;
    }

    // 日次通知上限チェック
    let remainingQuota = Infinity;
    if (config.maxNotificationsPerDay > 0) {
      const state = await loadHeartbeatState();
      const todayCount = getTodayNotificationCount(state.recentResults);
      if (todayCount >= config.maxNotificationsPerDay) {
        console.debug('[Heartbeat] 日次通知上限到達 — スキップ');
        return;
      }
      remainingQuota = config.maxNotificationsPerDay - todayCount;
    }

    const tasks = await getTasksDue(config);
    if (tasks.length === 0) return;

    await this.executeCheck(tasks, remainingQuota);
  }

  private async executeCheck(tasks: HeartbeatTask[], remainingQuota = Infinity): Promise<void> {
    this.isExecuting = true;
    const trace = tracer.startTrace('heartbeat.check');
    trace.rootSpan.setAttribute(LLM_ATTRS.SYSTEM, 'openai');
    trace.rootSpan.setAttribute(LLM_ATTRS.MODEL, 'gpt-5-nano');
    trace.rootSpan.setAttribute(HEARTBEAT_ATTRS.TASK_COUNT, tasks.length);

    try {
      const apiKey = getConfig().openaiApiKey;
      if (!apiKey) {
        trace.rootSpan.addEvent('heartbeat.skip', { reason: 'no_api_key' });
        return;
      }

      // 先制的に taskLastRun を更新（パース失敗時の再実行ループ防止）
      await batchUpdateTaskLastRun(tasks.map(t => t.id), Date.now());

      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      setDefaultOpenAIClient(client);

      // タスクを allowedMcpTools のセットでグループ化し、グループごとに Agent を実行
      const groups = groupTasksByMcpTools(tasks);
      const mcpServers = this.getMCPServers();
      const allHeartbeatResults: HeartbeatResult[] = [];

      for (const group of groups) {
        const results = await this.executeGroup(
          group.tasks,
          mcpServers,
          group.allowedMcpTools.length > 0 ? group.allowedMcpTools : undefined,
          trace,
        );
        allHeartbeatResults.push(...results);
      }

      // 日次通知上限で通知数をトリム（同一 tick 内で複数タスクが変化ありを返した場合の超過防止）
      const trimmed = Number.isFinite(remainingQuota)
        ? allHeartbeatResults.slice(0, remainingQuota)
        : allHeartbeatResults;
      if (trimmed.length > 0) {
        this.notify({ results: trimmed });
      }
    } catch (error) {
      console.error('[Heartbeat] チェック実行エラー:', error);
      trace.rootSpan.endWithError(error);
      // エラー時も taskLastRun を更新して即リトライを防止
      await batchUpdateTaskLastRun(tasks.map(t => t.id), Date.now()).catch(() => {});
    } finally {
      await trace.finish().catch(() => {});
      this.isExecuting = false;
    }
  }

  /** グループ単位で Agent を作成・実行し、hasChanges=true の結果を返す */
  private async executeGroup(
    tasks: HeartbeatTask[],
    mcpServers: MCPServer[],
    allowedMcpTools: string[] | undefined,
    trace: ReturnType<typeof tracer.startTrace>,
  ): Promise<HeartbeatResult[]> {
    const agent = await createHeartbeatAgent(mcpServers, allowedMcpTools, tasks);

    const taskDescriptions = tasks.map((t) =>
      `- タスクID: ${t.id}, タスク名: ${t.name}, 内容: ${t.description}`
    ).join('\n');

    const prompt = `以下のタスクについてチェックを実行してください:\n${taskDescriptions}`;

    const result = await run(agent, [user(prompt)], { stream: false });
    const finalOutput = (result as { finalOutput?: unknown }).finalOutput;

    if (typeof finalOutput !== 'string') {
      trace.rootSpan.addEvent('heartbeat.skip', { reason: 'no_string_output' });
      return [];
    }

    // JSON部分を抽出
    const jsonMatch = finalOutput.match(/\{[\s\S]*?\}(?=[^}]*$|\s*$)/);
    if (!jsonMatch) {
      trace.rootSpan.addEvent('heartbeat.skip', { reason: 'no_json_match' });
      return [];
    }

    let parsed: { results?: unknown };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('[Heartbeat] JSON パース失敗:', e);
      trace.rootSpan.addEvent('heartbeat.skip', { reason: 'json_parse_error' });
      return [];
    }

    if (!parsed || !Array.isArray(parsed.results)) {
      console.warn('[Heartbeat] パース結果の results が配列ではありません');
      trace.rootSpan.addEvent('heartbeat.skip', { reason: 'invalid_results' });
      return [];
    }

    const now = Date.now();
    const heartbeatResults: HeartbeatResult[] = [];

    for (const r of parsed.results) {
      if (!r || typeof r !== 'object' || typeof (r as Record<string, unknown>).taskId !== 'string') {
        continue;
      }
      const item = r as { taskId: string; hasChanges?: boolean; summary?: string };
      const hbResult: HeartbeatResult = {
        taskId: item.taskId,
        timestamp: now,
        hasChanges: Boolean(item.hasChanges),
        summary: item.summary || '',
        pinned: item.taskId.startsWith('briefing-') || item.taskId === 'reflection',
      };
      await addHeartbeatResult(hbResult);
      await updateTaskLastRun(item.taskId, now);
      trace.rootSpan.addEvent('heartbeat.task.result', {
        [HEARTBEAT_ATTRS.TASK_ID]: item.taskId,
        [HEARTBEAT_ATTRS.HAS_CHANGES]: hbResult.hasChanges,
      });
      if (hbResult.hasChanges) {
        heartbeatResults.push(hbResult);
      }
    }

    return heartbeatResults;
  }
}
