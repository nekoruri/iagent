/// <reference lib="webworker" />

import type { WorkerCommand, WorkerEvent, HeartbeatWorkerConfig } from './heartbeatWorkerProtocol';
import type { HeartbeatResult } from '../types';
import { isQuietHours } from '../core/heartbeat';
import { loadConfigFromIDB } from '../store/configStore';
import { loadHeartbeatState, addHeartbeatResult, updateTaskLastRun, getTaskLastRun } from '../store/heartbeatStore';
import { executeWorkerHeartbeatCheck } from '../core/heartbeatOpenAI';
import { getDB } from '../store/db';
import type { CalendarEvent, Memory } from '../types';

declare const self: DedicatedWorkerGlobalScope;

let config: HeartbeatWorkerConfig | null = null;
let timerId: ReturnType<typeof setInterval> | null = null;
let isExecuting = false;

function postEvent(event: WorkerEvent): void {
  self.postMessage(event);
}

async function tick(): Promise<void> {
  if (!config || isExecuting) return;

  const hbConfig = config.heartbeat;
  if (!hbConfig.enabled) return;
  if (isQuietHours(hbConfig)) return;

  // 最新設定を IndexedDB から取得（メインスレッドで変更されている可能性がある）
  try {
    const freshConfig = await loadConfigFromIDB();
    if (freshConfig?.heartbeat) {
      config = {
        openaiApiKey: freshConfig.openaiApiKey || config.openaiApiKey,
        heartbeat: freshConfig.heartbeat,
      };
    }
  } catch {
    // IndexedDB 読み取り失敗は無視して現在の設定で続行
  }

  // 実行すべきタスクを判定
  const tasks = await getWorkerTasksDue(config.heartbeat);
  if (tasks.length === 0) return;

  isExecuting = true;
  postEvent({ type: 'status', status: 'executing' });

  try {
    const apiKey = config.openaiApiKey;
    if (!apiKey) {
      return;
    }

    // IndexedDB からカレンダーイベントとメモリを取得
    const db = await getDB();
    const calendarEvents: CalendarEvent[] = await db.getAll('calendar');
    const memories: Memory[] = await db.getAll('memories');

    const results = await executeWorkerHeartbeatCheck(
      apiKey,
      tasks,
      calendarEvents,
      memories.slice(0, 5),
    );

    const now = Date.now();
    const heartbeatResults: HeartbeatResult[] = [];

    for (const r of results) {
      await addHeartbeatResult(r);
      await updateTaskLastRun(r.taskId, now);
      if (r.hasChanges) {
        heartbeatResults.push(r);
      }
    }

    if (heartbeatResults.length > 0) {
      postEvent({ type: 'heartbeat-result', results: heartbeatResults });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Heartbeat Worker] エラー:', message);
    postEvent({ type: 'error', message });
  } finally {
    isExecuting = false;
  }
}

/** タスクごとのスケジュールを評価し、実行すべきタスクを返す（Worker 版） */
async function getWorkerTasksDue(hbConfig: HeartbeatWorkerConfig['heartbeat']) {
  const now = Date.now();
  const currentDate = new Date();
  const currentHour = currentDate.getHours();
  const currentMinute = currentDate.getMinutes();
  const enabledTasks = hbConfig.tasks.filter((t) => t.enabled);
  const dueTasks: typeof enabledTasks = [];

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

self.onmessage = (e: MessageEvent<WorkerCommand>) => {
  const command = e.data;

  switch (command.type) {
    case 'start':
      config = command.config;
      if (timerId) clearInterval(timerId);
      timerId = setInterval(() => tick(), 60_000);
      postEvent({ type: 'status', status: 'running' });
      break;

    case 'stop':
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      config = null;
      postEvent({ type: 'status', status: 'stopped' });
      break;

    case 'run-now':
      tick();
      break;

    case 'update-config':
      config = command.config;
      break;
  }
};
