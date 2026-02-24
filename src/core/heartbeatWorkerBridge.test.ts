import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatWorkerBridge } from './heartbeatWorkerBridge';
import type { HeartbeatWorkerConfig } from '../workers/heartbeatWorkerProtocol';

// Worker モック
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  /** テスト用: Worker からのメッセージをシミュレートする */
  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }
}

let mockWorkerInstance: MockWorker;

// Worker コンストラクタをモック
vi.stubGlobal('Worker', class {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;

  constructor() {
    mockWorkerInstance = new MockWorker();
    this.postMessage = mockWorkerInstance.postMessage;
    this.terminate = mockWorkerInstance.terminate;
    // onmessage/onerror の setter をプロキシ
    Object.defineProperty(this, 'onmessage', {
      get: () => mockWorkerInstance.onmessage,
      set: (fn: ((e: MessageEvent) => void) | null) => { mockWorkerInstance.onmessage = fn; },
    });
    Object.defineProperty(this, 'onerror', {
      get: () => mockWorkerInstance.onerror,
      set: (fn: ((e: ErrorEvent) => void) | null) => { mockWorkerInstance.onerror = fn; },
    });
  }
});

const testConfig: HeartbeatWorkerConfig = {
  openaiApiKey: 'sk-test',
  heartbeat: {
    enabled: true,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    tasks: [],
    desktopNotification: false,
  },
};

describe('HeartbeatWorkerBridge', () => {
  let bridge: HeartbeatWorkerBridge;

  beforeEach(() => {
    bridge = new HeartbeatWorkerBridge();
  });

  afterEach(() => {
    bridge.dispose();
  });

  describe('init', () => {
    it('Worker を初期化する', () => {
      bridge.init();
      expect(mockWorkerInstance).toBeDefined();
    });

    it('二重初期化は無視される', () => {
      bridge.init();
      const first = mockWorkerInstance;
      bridge.init();
      // 同じインスタンスを保持（新しい Worker は作られない）
      expect(mockWorkerInstance).toBe(first);
    });
  });

  describe('start', () => {
    it('start コマンドを Worker に送信する', () => {
      bridge.init();
      bridge.start(testConfig);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        type: 'start',
        config: testConfig,
      });
    });
  });

  describe('stop', () => {
    it('stop コマンドを Worker に送信する', () => {
      bridge.init();
      bridge.stop();
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({ type: 'stop' });
    });
  });

  describe('runNow', () => {
    it('run-now コマンドを Worker に送信する', () => {
      bridge.init();
      bridge.runNow();
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({ type: 'run-now' });
    });
  });

  describe('updateConfig', () => {
    it('update-config コマンドを Worker に送信する', () => {
      bridge.init();
      bridge.updateConfig(testConfig);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        type: 'update-config',
        config: testConfig,
      });
    });
  });

  describe('subscribe / heartbeat-result', () => {
    it('heartbeat-result イベントでリスナーが呼ばれる', () => {
      bridge.init();
      const listener = vi.fn();
      bridge.subscribe(listener);

      mockWorkerInstance.simulateMessage({
        type: 'heartbeat-result',
        results: [{ taskId: 'test', timestamp: 123, hasChanges: true, summary: '変更あり' }],
      });

      expect(listener).toHaveBeenCalledWith({
        results: [{ taskId: 'test', timestamp: 123, hasChanges: true, summary: '変更あり' }],
      });
    });

    it('unsubscribe 後はリスナーが呼ばれない', () => {
      bridge.init();
      const listener = vi.fn();
      const unsub = bridge.subscribe(listener);
      unsub();

      mockWorkerInstance.simulateMessage({
        type: 'heartbeat-result',
        results: [],
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('複数リスナーが登録できる', () => {
      bridge.init();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      bridge.subscribe(listener1);
      bridge.subscribe(listener2);

      mockWorkerInstance.simulateMessage({
        type: 'heartbeat-result',
        results: [{ taskId: 'test', timestamp: 0, hasChanges: false, summary: '' }],
      });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('error イベント', () => {
    it('error イベントで console.warn が呼ばれる', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      bridge.init();

      mockWorkerInstance.simulateMessage({
        type: 'error',
        message: 'テストエラー',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        '[HeartbeatWorkerBridge] Worker エラー:',
        'テストエラー',
      );
      warnSpy.mockRestore();
    });
  });

  describe('status イベント', () => {
    it('status イベントで console.debug が呼ばれる', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      bridge.init();

      mockWorkerInstance.simulateMessage({
        type: 'status',
        status: 'running',
      });

      expect(debugSpy).toHaveBeenCalledWith(
        '[HeartbeatWorkerBridge] ステータス:',
        'running',
      );
      debugSpy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('Worker を terminate して null にする', () => {
      bridge.init();
      bridge.dispose();
      expect(mockWorkerInstance.terminate).toHaveBeenCalled();
    });

    it('dispose 後の send は安全に無視される', () => {
      bridge.init();
      bridge.dispose();
      // エラーが出ないことを確認
      bridge.start(testConfig);
      bridge.stop();
      bridge.runNow();
    });
  });

  describe('init 前の操作', () => {
    it('init 前の send は安全に無視される', () => {
      // エラーが出ないことを確認
      bridge.start(testConfig);
      bridge.stop();
      bridge.runNow();
    });
  });
});
