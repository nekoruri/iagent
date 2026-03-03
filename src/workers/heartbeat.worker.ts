/// <reference lib="webworker" />

import type { WorkerCommand, WorkerEvent, HeartbeatWorkerConfig } from './heartbeatWorkerProtocol';
import { isQuietHours } from '../core/heartbeat';
import { loadFreshConfig, getTasksDueFromIDB, executeHeartbeatAndStore } from '../core/heartbeatCommon';
import { batchUpdateTaskLastRun } from '../store/heartbeatStore';

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
  const fresh = await loadFreshConfig(config.openaiApiKey, config.heartbeat);
  config = { openaiApiKey: fresh.apiKey, heartbeat: fresh.heartbeat };

  // focusMode は最新設定で判定（別タブでの変更を反映）
  if (config.heartbeat.focusMode) {
    console.debug('[Heartbeat Worker] フォーカスモード中 — スキップ');
    return;
  }

  // 実行すべきタスクを判定
  const tasks = await getTasksDueFromIDB(config.heartbeat);
  if (tasks.length === 0) return;

  isExecuting = true;
  postEvent({ type: 'status', status: 'executing' });

  try {
    const { results: heartbeatResults, configChanged } = await executeHeartbeatAndStore(config.openaiApiKey, 'worker');

    if (heartbeatResults.length > 0) {
      postEvent({ type: 'heartbeat-result', results: heartbeatResults });
    }
    if (configChanged) {
      postEvent({ type: 'config-changed' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Heartbeat Worker] エラー:', message);
    postEvent({ type: 'error', message });
    // エラー時も taskLastRun を一括更新してリトライ暴走を防止
    await batchUpdateTaskLastRun(tasks.map(t => t.id), Date.now()).catch(() => {});
  } finally {
    isExecuting = false;
  }
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
