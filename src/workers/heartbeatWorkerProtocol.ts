import type { HeartbeatConfig, HeartbeatResult } from '../types';

/** メインスレッド → Worker に送るコマンド */
export type WorkerCommand =
  | { type: 'start'; config: HeartbeatWorkerConfig }
  | { type: 'stop' }
  | { type: 'run-now' }
  | { type: 'update-config'; config: HeartbeatWorkerConfig };

/** Worker → メインスレッドに送るイベント */
export type WorkerEvent =
  | { type: 'heartbeat-result'; results: HeartbeatResult[] }
  | { type: 'error'; message: string }
  | { type: 'status'; status: 'running' | 'stopped' | 'executing' }
  | { type: 'config-changed' };

/** Worker に渡す設定 */
export interface HeartbeatWorkerConfig {
  openaiApiKey: string;
  heartbeat: HeartbeatConfig;
}
