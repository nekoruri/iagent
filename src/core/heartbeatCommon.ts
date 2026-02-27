import { isQuietHours } from './heartbeat';
import { loadConfigFromIDB } from '../store/configStore';
import { loadHeartbeatState, addHeartbeatResult, updateTaskLastRun, getTaskLastRun } from '../store/heartbeatStore';
import { executeWorkerHeartbeatCheck } from './heartbeatOpenAI';
import { getDB } from '../store/db';
import { getDefaultPersonaConfig } from './config';
import type { HeartbeatConfig, HeartbeatResult, HeartbeatSource, HeartbeatTask, CalendarEvent, Memory } from '../types';

/** IndexedDB から最新設定を読み込み、API キーと Heartbeat 設定を返す */
export async function loadFreshConfig(
  fallbackApiKey: string,
  fallbackHeartbeat: HeartbeatConfig,
): Promise<{ apiKey: string; heartbeat: HeartbeatConfig }> {
  try {
    const freshConfig = await loadConfigFromIDB();
    if (freshConfig?.heartbeat) {
      return {
        apiKey: freshConfig.openaiApiKey || fallbackApiKey,
        heartbeat: freshConfig.heartbeat,
      };
    }
  } catch {
    // IndexedDB 読み取り失敗は無視して現在の設定で続行
  }
  return { apiKey: fallbackApiKey, heartbeat: fallbackHeartbeat };
}

/** タスクごとのスケジュールを評価し、実行すべきタスクを返す（Worker / SW 共通） */
export async function getTasksDueFromIDB(hbConfig: HeartbeatConfig): Promise<HeartbeatTask[]> {
  const now = Date.now();
  const currentDate = new Date();
  const currentHour = currentDate.getHours();
  const currentMinute = currentDate.getMinutes();
  const enabledTasks = hbConfig.tasks.filter((t) => t.enabled);
  const dueTasks: HeartbeatTask[] = [];

  for (const task of enabledTasks) {
    const schedule = task.schedule;

    if (!schedule || schedule.type === 'global') {
      const state = await loadHeartbeatState();
      const intervalMs = hbConfig.intervalMinutes * 60_000;
      if (now - state.lastChecked >= intervalMs) {
        dueTasks.push(task);
      }
    } else if (schedule.type === 'interval') {
      const lastRun = await getTaskLastRun(task.id);
      const intervalMs = (schedule.intervalMinutes ?? hbConfig.intervalMinutes) * 60_000;
      if (now - lastRun >= intervalMs) {
        dueTasks.push(task);
      }
    } else if (schedule.type === 'fixed-time') {
      const targetHour = schedule.hour ?? 8;
      const targetMinute = schedule.minute ?? 0;
      if (currentHour === targetHour && Math.abs(currentMinute - targetMinute) <= 1) {
        const lastRun = await getTaskLastRun(task.id);
        const todayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
        if (lastRun < todayStart) {
          dueTasks.push(task);
        }
      }
    }
  }

  return dueTasks;
}

/**
 * Heartbeat チェックを実行し、結果を IndexedDB に保存する。
 * Worker / Service Worker 共通のパイプライン。
 * @param apiKey フォールバック用 API キー（通常は空文字で IDB から取得）
 * @param source 実行元の識別子
 * @returns 変化ありの結果のみ返す
 */
export async function executeHeartbeatAndStore(apiKey: string, source?: HeartbeatSource): Promise<HeartbeatResult[]> {
  // IndexedDB から最新設定を読み込む
  const freshConfig = await loadConfigFromIDB();
  const hbConfig = freshConfig?.heartbeat;
  if (!hbConfig || !hbConfig.enabled) return [];
  if (isQuietHours(hbConfig)) return [];

  const resolvedApiKey = freshConfig?.openaiApiKey || apiKey;
  if (!resolvedApiKey) return [];

  // 実行すべきタスクを判定
  const tasks = await getTasksDueFromIDB(hbConfig);
  if (tasks.length === 0) return [];

  // IndexedDB からカレンダーイベントとメモリを取得
  const db = await getDB();
  const calendarEvents: CalendarEvent[] = await db.getAll('calendar');
  const memories: Memory[] = await db.getAll('memories');

  // persona を取得（未設定時はデフォルト）
  const persona = freshConfig?.persona ?? getDefaultPersonaConfig();

  const results = await executeWorkerHeartbeatCheck(
    resolvedApiKey,
    tasks,
    calendarEvents,
    memories.slice(0, 5),
    persona,
  );

  const now = Date.now();
  const heartbeatResults: HeartbeatResult[] = [];
  const label = source ?? 'unknown';

  console.log(`[Heartbeat:${label}] ${results.length} 件のタスクを実行`);

  for (const r of results) {
    const tagged = {
      ...r,
      source,
      pinned: r.taskId.startsWith('briefing-') || r.taskId === 'reflection',
    };
    await addHeartbeatResult(tagged);
    await updateTaskLastRun(r.taskId, now);
    if (r.hasChanges) {
      heartbeatResults.push(tagged);
    }
  }

  console.log(`[Heartbeat:${label}] 完了: 変化あり=${heartbeatResults.length}, 変化なし=${results.length - heartbeatResults.length}`);

  return heartbeatResults;
}
