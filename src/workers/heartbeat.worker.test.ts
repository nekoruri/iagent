import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HeartbeatWorkerConfig, WorkerCommand } from './heartbeatWorkerProtocol';

// --- 依存モジュールのモック ---
const mockIsQuietHours = vi.fn().mockReturnValue(false);
const mockLoadFreshConfig = vi.fn();
const mockGetTasksDueFromIDB = vi.fn();
const mockExecuteHeartbeatAndStore = vi.fn();
const mockBatchUpdateTaskLastRun = vi.fn();

vi.mock('../core/heartbeat', () => ({
  isQuietHours: (...args: unknown[]) => mockIsQuietHours(...args),
}));

vi.mock('../core/heartbeatCommon', () => ({
  loadFreshConfig: (...args: unknown[]) => mockLoadFreshConfig(...args),
  getTasksDueFromIDB: (...args: unknown[]) => mockGetTasksDueFromIDB(...args),
  executeHeartbeatAndStore: (...args: unknown[]) => mockExecuteHeartbeatAndStore(...args),
}));

vi.mock('../store/heartbeatStore', () => ({
  batchUpdateTaskLastRun: (...args: unknown[]) => mockBatchUpdateTaskLastRun(...args),
}));

// --- postMessage のモック ---
const mockPostMessage = vi.fn();

// --- テスト用定数 ---
const testConfig: HeartbeatWorkerConfig = {
  openaiApiKey: 'sk-test',
  heartbeat: {
    enabled: true,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    tasks: [{ id: 'task-1', label: 'テスト', prompt: 'テスト', schedule: { type: 'global' as const } }],
    desktopNotification: false,
  },
};

/** Worker の onmessage ハンドラにコマンドを送信する */
function sendCommand(command: WorkerCommand): void {
  const handler = self.onmessage as ((e: MessageEvent) => void) | null;
  if (handler) {
    handler(new MessageEvent('message', { data: command }));
  }
}

/** mockPostMessage の呼び出しから指定タイプのイベントを取得する */
function getPostedEvents(type?: string): unknown[] {
  const calls = mockPostMessage.mock.calls.map((c) => c[0]);
  if (type) return calls.filter((e: { type?: string }) => e.type === type);
  return calls;
}

describe('heartbeat.worker', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 前のテストの setInterval を消去（resetModules では消えない）
    vi.clearAllTimers();

    // モジュール状態をリセット（config, timerId, isExecuting がクリーンになる）
    vi.resetModules();

    // self.postMessage をモック化（jsdom では self === globalThis）
    vi.stubGlobal('postMessage', mockPostMessage);

    // デフォルトのモック動作
    mockIsQuietHours.mockReturnValue(false);
    mockLoadFreshConfig.mockResolvedValue({ apiKey: 'sk-test', heartbeat: testConfig.heartbeat });
    mockGetTasksDueFromIDB.mockResolvedValue([]);
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });
    mockBatchUpdateTaskLastRun.mockResolvedValue(undefined);

    // Worker モジュールを import（self.onmessage が設定される）
    await import('./heartbeat.worker');
  });

  // ============================================================
  // コマンドハンドリング
  // ============================================================
  describe('start コマンド', () => {
    it('status: running を返す', () => {
      sendCommand({ type: 'start', config: testConfig });

      expect(getPostedEvents('status')).toContainEqual({
        type: 'status',
        status: 'running',
      });
    });

    it('タイマーを開始する（60秒間隔）', async () => {
      mockGetTasksDueFromIDB.mockResolvedValue([testConfig.heartbeat.tasks[0]]);
      mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [
        { taskId: 'task-1', timestamp: Date.now(), hasChanges: false, summary: 'テスト' },
      ], configChanged: false });

      sendCommand({ type: 'start', config: testConfig });
      mockPostMessage.mockClear();

      // 59秒では tick しない
      await vi.advanceTimersByTimeAsync(59_000);
      expect(mockExecuteHeartbeatAndStore).not.toHaveBeenCalled();

      // 60秒で tick する
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mockExecuteHeartbeatAndStore).toHaveBeenCalled();
    });
  });

  describe('stop コマンド', () => {
    it('status: stopped を返す', () => {
      sendCommand({ type: 'start', config: testConfig });
      mockPostMessage.mockClear();

      sendCommand({ type: 'stop' });

      expect(getPostedEvents('status')).toContainEqual({
        type: 'status',
        status: 'stopped',
      });
    });

    it('タイマーを停止する', async () => {
      mockGetTasksDueFromIDB.mockResolvedValue([testConfig.heartbeat.tasks[0]]);

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'stop' });

      await vi.advanceTimersByTimeAsync(120_000);
      expect(mockExecuteHeartbeatAndStore).not.toHaveBeenCalled();
    });
  });

  describe('run-now コマンド', () => {
    it('tick を即座に実行する', async () => {
      mockGetTasksDueFromIDB.mockResolvedValue([testConfig.heartbeat.tasks[0]]);
      mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [
        { taskId: 'task-1', timestamp: Date.now(), hasChanges: true, summary: '結果' },
      ], configChanged: false });

      sendCommand({ type: 'start', config: testConfig });
      mockPostMessage.mockClear();

      sendCommand({ type: 'run-now' });
      // tick は async なので microtask を消化
      await vi.advanceTimersByTimeAsync(0);

      expect(mockExecuteHeartbeatAndStore).toHaveBeenCalledWith('sk-test', 'worker');
    });
  });

  describe('update-config コマンド', () => {
    it('config を更新する（次回 tick に反映）', async () => {
      const newConfig: HeartbeatWorkerConfig = {
        openaiApiKey: 'sk-new-key',
        heartbeat: { ...testConfig.heartbeat, enabled: false },
      };

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'update-config', config: newConfig });
      mockPostMessage.mockClear();

      // 更新後の config で tick が実行される（enabled: false なので何もしない）
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockExecuteHeartbeatAndStore).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // tick ロジック
  // ============================================================
  describe('tick', () => {
    it('config がない場合は何もしない', async () => {
      // start していない状態で run-now を送る
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockLoadFreshConfig).not.toHaveBeenCalled();
    });

    it('heartbeat.enabled が false の場合はスキップする', async () => {
      const disabledConfig: HeartbeatWorkerConfig = {
        openaiApiKey: 'sk-test',
        heartbeat: { ...testConfig.heartbeat, enabled: false },
      };
      sendCommand({ type: 'start', config: disabledConfig });

      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockLoadFreshConfig).not.toHaveBeenCalled();
    });

    it('quiet hours の場合はスキップする', async () => {
      mockIsQuietHours.mockReturnValue(true);

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockLoadFreshConfig).not.toHaveBeenCalled();
    });

    it('実行すべきタスクがない場合はスキップする', async () => {
      mockGetTasksDueFromIDB.mockResolvedValue([]);

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockExecuteHeartbeatAndStore).not.toHaveBeenCalled();
    });

    it('タスクがある場合は executeHeartbeatAndStore を呼ぶ', async () => {
      const task = testConfig.heartbeat.tasks[0];
      mockGetTasksDueFromIDB.mockResolvedValue([task]);
      mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [
        { taskId: 'task-1', timestamp: Date.now(), hasChanges: true, summary: 'ニュース更新' },
      ], configChanged: false });

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockExecuteHeartbeatAndStore).toHaveBeenCalledWith('sk-test', 'worker');
      expect(getPostedEvents('heartbeat-result')).toHaveLength(1);
    });

    it('結果がない場合は heartbeat-result を送信しない', async () => {
      mockGetTasksDueFromIDB.mockResolvedValue([testConfig.heartbeat.tasks[0]]);
      mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(getPostedEvents('heartbeat-result')).toHaveLength(0);
    });

    it('実行中に executing ステータスを送信する', async () => {
      mockGetTasksDueFromIDB.mockResolvedValue([testConfig.heartbeat.tasks[0]]);
      mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

      sendCommand({ type: 'start', config: testConfig });
      mockPostMessage.mockClear();

      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(getPostedEvents('status')).toContainEqual({
        type: 'status',
        status: 'executing',
      });
    });

    it('IndexedDB から最新設定を読み込む', async () => {
      const freshConfig = {
        apiKey: 'sk-fresh',
        heartbeat: { ...testConfig.heartbeat },
      };
      mockLoadFreshConfig.mockResolvedValue(freshConfig);
      mockGetTasksDueFromIDB.mockResolvedValue([testConfig.heartbeat.tasks[0]]);
      mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockLoadFreshConfig).toHaveBeenCalledWith('sk-test', testConfig.heartbeat);
      // 更新された API キーで実行される
      expect(mockExecuteHeartbeatAndStore).toHaveBeenCalledWith('sk-fresh', 'worker');
    });

    it('エラー時は error イベントを送信する', async () => {
      mockGetTasksDueFromIDB.mockResolvedValue([testConfig.heartbeat.tasks[0]]);
      mockExecuteHeartbeatAndStore.mockRejectedValue(new Error('API 接続エラー'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(getPostedEvents('error')).toContainEqual({
        type: 'error',
        message: 'API 接続エラー',
      });
      consoleSpy.mockRestore();
    });

    it('エラー時に taskLastRun を更新してリトライ暴走を防ぐ', async () => {
      const task = { ...testConfig.heartbeat.tasks[0], id: 'task-1' };
      mockGetTasksDueFromIDB.mockResolvedValue([task]);
      mockExecuteHeartbeatAndStore.mockRejectedValue(new Error('エラー'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockBatchUpdateTaskLastRun).toHaveBeenCalledWith(
        ['task-1'],
        expect.any(Number),
      );
    });

    it('Error 以外の例外もメッセージ化して送信する', async () => {
      mockGetTasksDueFromIDB.mockResolvedValue([testConfig.heartbeat.tasks[0]]);
      mockExecuteHeartbeatAndStore.mockRejectedValue('文字列エラー');
      vi.spyOn(console, 'error').mockImplementation(() => {});

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'run-now' });
      await vi.advanceTimersByTimeAsync(0);

      expect(getPostedEvents('error')).toContainEqual({
        type: 'error',
        message: '文字列エラー',
      });
    });
  });

  // ============================================================
  // タイマー管理
  // ============================================================
  describe('タイマー管理', () => {
    it('start を2回呼ぶと古いタイマーを破棄して新しいタイマーを作る', async () => {
      mockGetTasksDueFromIDB.mockResolvedValue([testConfig.heartbeat.tasks[0]]);
      mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

      sendCommand({ type: 'start', config: testConfig });
      sendCommand({ type: 'start', config: testConfig });

      // 60秒後に tick は1回だけ呼ばれるべき（2重タイマーにならない）
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockExecuteHeartbeatAndStore).toHaveBeenCalledTimes(1);
    });
  });
});
