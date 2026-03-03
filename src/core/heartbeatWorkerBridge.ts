import type { WorkerCommand, WorkerEvent, HeartbeatWorkerConfig } from '../workers/heartbeatWorkerProtocol';
import type { HeartbeatNotification } from './heartbeat';

type Listener = (notification: HeartbeatNotification) => void;
type ConfigChangeListener = () => void;

export class HeartbeatWorkerBridge {
  private worker: Worker | null = null;
  private listeners: Listener[] = [];
  private configChangeListeners: ConfigChangeListener[] = [];

  /** Worker を初期化する */
  init(): void {
    if (this.worker) return;
    this.worker = new Worker(
      new URL('../workers/heartbeat.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.onmessage = (e: MessageEvent<WorkerEvent>) => {
      this.handleMessage(e.data);
    };
    this.worker.onerror = (e) => {
      console.error('[HeartbeatWorkerBridge] Worker エラー:', e.message);
    };
  }

  /** Worker に開始コマンドを送信する */
  start(config: HeartbeatWorkerConfig): void {
    this.send({ type: 'start', config });
  }

  /** Worker に停止コマンドを送信する */
  stop(): void {
    this.send({ type: 'stop' });
  }

  /** 即座に Heartbeat チェックを実行する */
  runNow(): void {
    this.send({ type: 'run-now' });
  }

  /** Worker の設定を更新する */
  updateConfig(config: HeartbeatWorkerConfig): void {
    this.send({ type: 'update-config', config });
  }

  /** リスナーを登録する */
  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** config-changed リスナーを登録する */
  subscribeConfigChange(listener: ConfigChangeListener): () => void {
    this.configChangeListeners.push(listener);
    return () => {
      this.configChangeListeners = this.configChangeListeners.filter((l) => l !== listener);
    };
  }

  /** Worker を終了して破棄する */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.listeners = [];
    this.configChangeListeners = [];
  }

  private send(command: WorkerCommand): void {
    this.worker?.postMessage(command);
  }

  private handleMessage(event: WorkerEvent): void {
    switch (event.type) {
      case 'heartbeat-result':
        this.notify({ results: event.results });
        break;
      case 'error':
        console.warn('[HeartbeatWorkerBridge] Worker エラー:', event.message);
        break;
      case 'status':
        // ステータス変更ログ（デバッグ用）
        console.debug('[HeartbeatWorkerBridge] ステータス:', event.status);
        break;
      case 'config-changed':
        console.debug('[HeartbeatWorkerBridge] 設定変更を検知');
        this.notifyConfigChange();
        break;
    }
  }

  private notify(notification: HeartbeatNotification): void {
    for (const listener of this.listeners) {
      listener(notification);
    }
  }

  private notifyConfigChange(): void {
    for (const listener of this.configChangeListeners) {
      listener();
    }
  }
}
