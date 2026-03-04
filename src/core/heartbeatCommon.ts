import { isQuietHours, getTodayNotificationCount } from './heartbeat';
import { loadConfigFromIDB } from '../store/configStore';
import {
  addHeartbeatResult,
  updateTaskLastRun,
  batchUpdateTaskLastRun,
  getAllTaskLastRun,
  loadHeartbeatState,
  appendOpsEvent,
} from '../store/heartbeatStore';
import { executeWorkerHeartbeatCheck } from './heartbeatOpenAI';
import { getDB } from '../store/db';
import { getRelevantMemories, getMemoriesForBriefing } from '../store/memoryStore';
import { getDefaultPersonaConfig } from './config';
import type { HeartbeatConfig, HeartbeatResult, HeartbeatSource, HeartbeatTask, CalendarEvent } from '../types';

/** executeHeartbeatAndStore の戻り値 */
export interface HeartbeatAndStoreResult {
  results: HeartbeatResult[];
  configChanged: boolean;
}

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

  // state を1回ロードして全タスクの lastRun を参照（N+1 防止）
  const taskLastRunMap = await getAllTaskLastRun();

  for (const task of enabledTasks) {
    const schedule = task.schedule;
    const lastRun = taskLastRunMap[task.id] ?? 0;

    if (!schedule || schedule.type === 'global') {
      // グローバル間隔: taskLastRun で個別追跡（飢餓防止）
      const intervalMs = hbConfig.intervalMinutes * 60_000;
      if (now - lastRun >= intervalMs) {
        dueTasks.push(task);
      }
    } else if (schedule.type === 'interval') {
      const intervalMs = (schedule.intervalMinutes ?? hbConfig.intervalMinutes) * 60_000;
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

/**
 * Heartbeat チェックを実行し、結果を IndexedDB に保存する。
 * Worker / Service Worker 共通のパイプライン。
 * @param apiKey フォールバック用 API キー（通常は空文字で IDB から取得）
 * @param source 実行元の識別子
 * @returns 変化ありの結果 + configChanged フラグ
 */
export async function executeHeartbeatAndStore(apiKey: string, source?: HeartbeatSource): Promise<HeartbeatAndStoreResult> {
  const EMPTY: HeartbeatAndStoreResult = { results: [], configChanged: false };
  const startedAt = Date.now();
  const sourceLabel = source ?? 'unknown';
  const logRun = async (status: 'success' | 'failure' | 'skipped', extras: Record<string, unknown> = {}) => {
    await appendOpsEvent({
      type: 'heartbeat-run',
      timestamp: Date.now(),
      source: sourceLabel,
      status,
      durationMs: Date.now() - startedAt,
      ...extras,
    }).catch(() => {});
  };

  // IndexedDB から最新設定を読み込む
  const freshConfig = await loadConfigFromIDB();
  const hbConfig = freshConfig?.heartbeat;
  if (!hbConfig || !hbConfig.enabled) {
    await logRun('skipped', { reason: 'disabled' });
    return EMPTY;
  }
  if (isQuietHours(hbConfig)) {
    await logRun('skipped', { reason: 'quiet_hours' });
    return EMPTY;
  }
  if (hbConfig.focusMode) {
    console.debug('[Heartbeat SW] フォーカスモード中 — スキップ');
    await logRun('skipped', { reason: 'focus_mode' });
    return EMPTY;
  }

  // 日次通知上限チェック
  if (hbConfig.maxNotificationsPerDay > 0) {
    const state = await loadHeartbeatState();
    const todayCount = getTodayNotificationCount(state.recentResults);
    if (todayCount >= hbConfig.maxNotificationsPerDay) {
      console.debug(`[Heartbeat:${source ?? 'unknown'}] 日次通知上限到達 — スキップ`);
      await logRun('skipped', { reason: 'daily_quota_reached' });
      return EMPTY;
    }
  }

  const resolvedApiKey = freshConfig?.openaiApiKey || apiKey;
  if (!resolvedApiKey) {
    await logRun('skipped', { reason: 'no_api_key' });
    return EMPTY;
  }

  // 実行すべきタスクを判定
  const tasks = await getTasksDueFromIDB(hbConfig);
  if (tasks.length === 0) {
    await logRun('skipped', { reason: 'no_due_tasks' });
    return EMPTY;
  }

  // 先制的に taskLastRun を更新（パース失敗時の再実行ループ防止）
  await batchUpdateTaskLastRun(tasks.map(t => t.id), Date.now());

  // IndexedDB からカレンダーイベントを取得、メモリは関連性スコアリングで取得
  const db = await getDB();
  const calendarEvents: CalendarEvent[] = await db.getAll('calendar');
  const hasBriefing = tasks.some((t) => t.id.startsWith('briefing-'));
  const memories = hasBriefing
    ? await getMemoriesForBriefing(15)
    : await getRelevantMemories('', 5);

  // persona を取得（未設定時はデフォルト）
  const persona = freshConfig?.persona ?? getDefaultPersonaConfig();

  try {
    const { results, configChanged } = await executeWorkerHeartbeatCheck(
      resolvedApiKey,
      tasks,
      calendarEvents,
      memories,
      persona,
    );

    const now = Date.now();
    const heartbeatResults: HeartbeatResult[] = [];

    console.log(`[Heartbeat:${sourceLabel}] ${results.length} 件のタスクを実行`);

    for (const r of results) {
      const tagged = {
        ...r,
        source,
        pinned: r.taskId.startsWith('briefing-') || r.taskId === 'reflection' || r.taskId === 'monthly-review' || r.taskId === 'suggestion-optimization',
      };
      await addHeartbeatResult(tagged);
      await updateTaskLastRun(r.taskId, now);
      if (r.hasChanges) {
        heartbeatResults.push(tagged);
      }
    }

    console.log(`[Heartbeat:${sourceLabel}] 完了: 変化あり=${heartbeatResults.length}, 変化なし=${results.length - heartbeatResults.length}${configChanged ? ', 設定変更あり' : ''}`);

    await logRun('success', {
      taskCount: tasks.length,
      resultCount: results.length,
      changedCount: heartbeatResults.length,
    });
    return { results: heartbeatResults, configChanged };
  } catch (error) {
    await logRun('failure', {
      taskCount: tasks.length,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
