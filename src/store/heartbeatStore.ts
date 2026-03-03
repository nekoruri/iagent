import { getDB } from './db';
import type { HeartbeatState, HeartbeatResult, FeedbackType } from '../types';

const STORE_NAME = 'heartbeat';
const STATE_KEY = 'state';
const MAX_RECENT_RESULTS = 50;

export async function loadHeartbeatState(): Promise<HeartbeatState> {
  const db = await getDB();
  const row = await db.get(STORE_NAME, STATE_KEY);
  if (row) {
    return {
      lastChecked: row.lastChecked,
      recentResults: row.recentResults,
      taskLastRun: row.taskLastRun,
    };
  }
  return { lastChecked: 0, recentResults: [] };
}

export async function saveHeartbeatState(state: HeartbeatState): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, { key: STATE_KEY, ...state });
}

export async function updateLastChecked(timestamp: number): Promise<void> {
  const state = await loadHeartbeatState();
  state.lastChecked = timestamp;
  await saveHeartbeatState(state);
}

export async function updateTaskLastRun(taskId: string, timestamp: number): Promise<void> {
  const state = await loadHeartbeatState();
  if (!state.taskLastRun) state.taskLastRun = {};
  state.taskLastRun[taskId] = timestamp;
  await saveHeartbeatState(state);
}

export async function getTaskLastRun(taskId: string): Promise<number> {
  const state = await loadHeartbeatState();
  return state.taskLastRun?.[taskId] ?? 0;
}

/** state を1回ロードして全タスクの lastRun を取得 */
export async function getAllTaskLastRun(): Promise<Record<string, number>> {
  const state = await loadHeartbeatState();
  return state.taskLastRun ?? {};
}

/** 複数タスクの lastRun を1回の state 保存で更新 */
export async function batchUpdateTaskLastRun(taskIds: string[], timestamp: number): Promise<void> {
  const state = await loadHeartbeatState();
  if (!state.taskLastRun) state.taskLastRun = {};
  for (const id of taskIds) {
    state.taskLastRun[id] = timestamp;
  }
  await saveHeartbeatState(state);
}

export async function addHeartbeatResult(result: HeartbeatResult): Promise<void> {
  const state = await loadHeartbeatState();
  state.recentResults.unshift(result);
  if (state.recentResults.length > MAX_RECENT_RESULTS) {
    const pinned = state.recentResults.filter(r => r.pinned);
    const unpinned = state.recentResults.filter(r => !r.pinned);
    const unpinnedLimit = MAX_RECENT_RESULTS - pinned.length;
    state.recentResults = [...pinned, ...unpinned.slice(0, Math.max(0, unpinnedLimit))];
    state.recentResults.sort((a, b) => b.timestamp - a.timestamp);
  }
  state.lastChecked = result.timestamp;
  await saveHeartbeatState(state);
}

export async function togglePinHeartbeatResult(taskId: string, timestamp: number): Promise<void> {
  const state = await loadHeartbeatState();
  const target = state.recentResults.find(r => r.taskId === taskId && r.timestamp === timestamp);
  if (target) {
    target.pinned = !target.pinned;
    await saveHeartbeatState(state);
  }
}

/** 結果にフィードバックを設定 */
export async function setHeartbeatFeedback(
  taskId: string,
  timestamp: number,
  type: FeedbackType,
  snoozedUntil?: number,
): Promise<void> {
  const state = await loadHeartbeatState();
  const target = state.recentResults.find(r => r.taskId === taskId && r.timestamp === timestamp);
  if (target) {
    const DEFAULT_SNOOZE_MS = 3600_000; // 1時間
    target.feedback = {
      type,
      timestamp: Date.now(),
      // snoozed の場合は snoozedUntil を必ず設定（欠損時は 1 時間後にフォールバック）
      ...(type === 'snoozed'
        ? { snoozedUntil: snoozedUntil ?? Date.now() + DEFAULT_SNOOZE_MS }
        : {}),
    };
    await saveHeartbeatState(state);
  }
}

/** タスク別フィードバック統計 */
export interface TaskFeedbackStats {
  taskId: string;
  accepted: number;
  dismissed: number;
  snoozed: number;
  total: number;
  acceptRate: number;
}

/** フィードバック集計サマリー */
export interface FeedbackSummary {
  periodMs: number;
  totalResults: number;
  totalWithFeedback: number;
  overallAcceptRate: number;
  taskStats: TaskFeedbackStats[];
}

/** 指定期間のフィードバックを集計する */
export async function getHeartbeatFeedbackSummary(periodMs: number = 24 * 60 * 60 * 1000): Promise<FeedbackSummary> {
  const state = await loadHeartbeatState();
  const now = Date.now();
  const cutoff = now - periodMs;

  // 期間内の結果をフィルタ
  const recentResults = state.recentResults.filter((r) => r.timestamp >= cutoff);

  // タスク別集計
  const taskMap = new Map<string, { accepted: number; dismissed: number; snoozed: number }>();
  for (const r of recentResults) {
    if (!taskMap.has(r.taskId)) {
      taskMap.set(r.taskId, { accepted: 0, dismissed: 0, snoozed: 0 });
    }
    const stats = taskMap.get(r.taskId)!;
    if (r.feedback) {
      stats[r.feedback.type]++;
    }
  }

  const taskStats: TaskFeedbackStats[] = [];
  let totalWithFeedback = 0;
  let totalAccepted = 0;

  for (const [taskId, stats] of taskMap) {
    const total = stats.accepted + stats.dismissed + stats.snoozed;
    // フィードバックなしのタスクは除外（0% と誤解されるのを防止）
    if (total === 0) continue;
    totalWithFeedback += total;
    totalAccepted += stats.accepted;
    taskStats.push({
      taskId,
      accepted: stats.accepted,
      dismissed: stats.dismissed,
      snoozed: stats.snoozed,
      total,
      acceptRate: total > 0 ? stats.accepted / total : 0,
    });
  }

  // Accept 率の高い順にソート
  taskStats.sort((a, b) => b.acceptRate - a.acceptRate);

  return {
    periodMs,
    totalResults: recentResults.length,
    totalWithFeedback,
    overallAcceptRate: totalWithFeedback > 0 ? totalAccepted / totalWithFeedback : 0,
    taskStats,
  };
}

// --- Action Log ---

const ACTION_LOG_KEY = 'action-log';
const MAX_ACTION_LOG = 100;

export interface ActionLogEntry {
  type: string;
  reason: string;
  detail: string;
  timestamp: number;
}

/** アクションログを保存する（上限100件、古いものから切り捨て） */
export async function saveActionLog(entries: ActionLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await getDB();
  const row = await db.get(STORE_NAME, ACTION_LOG_KEY);
  const existing: ActionLogEntry[] = row?.entries ?? [];
  const merged = [...existing, ...entries];
  // 上限超過分を古い順に切り捨て
  const trimmed = merged.length > MAX_ACTION_LOG
    ? merged.slice(merged.length - MAX_ACTION_LOG)
    : merged;
  await db.put(STORE_NAME, { key: ACTION_LOG_KEY, entries: trimmed });
}

/** アクションログを読み込む */
export async function loadActionLog(): Promise<ActionLogEntry[]> {
  const db = await getDB();
  const row = await db.get(STORE_NAME, ACTION_LOG_KEY);
  return row?.entries ?? [];
}

/** dismissed 非表示、snoozed は期限前のみ非表示 */
export function filterVisibleResults(results: HeartbeatResult[], now = Date.now()): HeartbeatResult[] {
  return results.filter((r) => {
    if (!r.feedback) return true;
    if (r.feedback.type === 'dismissed') return false;
    if (r.feedback.type === 'snoozed') {
      // snoozedUntil 欠損時は表示する（永久非表示を防止）
      if (r.feedback.snoozedUntil == null) return true;
      return now >= r.feedback.snoozedUntil;
    }
    return true; // accepted は表示
  });
}
