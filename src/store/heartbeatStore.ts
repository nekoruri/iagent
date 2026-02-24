import { getDB } from './db';
import type { HeartbeatState, HeartbeatResult } from '../types';

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

export async function addHeartbeatResult(result: HeartbeatResult): Promise<void> {
  const state = await loadHeartbeatState();
  state.recentResults.unshift(result);
  if (state.recentResults.length > MAX_RECENT_RESULTS) {
    state.recentResults = state.recentResults.slice(0, MAX_RECENT_RESULTS);
  }
  state.lastChecked = result.timestamp;
  await saveHeartbeatState(state);
}
