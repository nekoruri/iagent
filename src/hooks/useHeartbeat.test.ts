import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHeartbeat } from './useHeartbeat';

// HeartbeatEngine モック
const mockEngine = {
  start: vi.fn(),
  stop: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  setAgentBusy: vi.fn(),
  runNow: vi.fn(),
};

vi.mock('../core/heartbeat', () => ({
  HeartbeatEngine: vi.fn(() => mockEngine),
}));

// HeartbeatWorkerBridge モック
const mockBridge = {
  init: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  subscribeConfigChange: vi.fn(() => vi.fn()),
  dispose: vi.fn(),
  updateConfig: vi.fn(),
};

vi.mock('../core/heartbeatWorkerBridge', () => ({
  HeartbeatWorkerBridge: vi.fn(() => mockBridge),
}));

// config モック
vi.mock('../core/config', () => ({
  getConfig: vi.fn(() => ({
    openaiApiKey: 'sk-test',
    heartbeat: {
      enabled: true,
      intervalMinutes: 30,
      quietHoursStart: 0,
      quietHoursEnd: 6,
      tasks: [],
      desktopNotification: false,
    },
  })),
}));

// mcpManager モック
vi.mock('../core/mcpManager', () => ({
  mcpManager: {
    getActiveServers: vi.fn(() => []),
  },
}));

// configStore モック
vi.mock('../store/configStore', () => ({
  loadConfigFromIDB: vi.fn().mockResolvedValue(null),
}));

// notifier モック
vi.mock('../core/notifier', () => ({
  sendHeartbeatNotifications: vi.fn(),
}));

// pushSubscription モック
vi.mock('../core/pushSubscription', () => ({
  getPushSubscription: vi.fn().mockResolvedValue(null),
  registerPeriodicSync: vi.fn().mockResolvedValue(undefined),
}));

describe('useHeartbeat', () => {
  let swAddEventListener: ReturnType<typeof vi.fn>;
  let swRemoveEventListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // navigator.serviceWorker のモック
    swAddEventListener = vi.fn();
    swRemoveEventListener = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: swAddEventListener,
        removeEventListener: swRemoveEventListener,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('初期化時にエンジンと Worker ブリッジを作成してスタートする', () => {
    const onNotification = vi.fn();
    renderHook(() => useHeartbeat({ isStreaming: false, onNotification }));

    expect(mockEngine.subscribe).toHaveBeenCalled();
    expect(mockBridge.init).toHaveBeenCalled();
    expect(mockBridge.subscribe).toHaveBeenCalled();
    expect(mockEngine.start).toHaveBeenCalled();
  });

  it('アンマウント時にエンジン停止とブリッジ破棄が行われる', () => {
    const onNotification = vi.fn();
    const { unmount } = renderHook(() =>
      useHeartbeat({ isStreaming: false, onNotification }),
    );

    unmount();

    expect(mockEngine.stop).toHaveBeenCalled();
    expect(mockBridge.dispose).toHaveBeenCalled();
  });

  it('isStreaming 変更時に setAgentBusy が呼ばれる', () => {
    const onNotification = vi.fn();
    const { rerender } = renderHook(
      ({ isStreaming }) => useHeartbeat({ isStreaming, onNotification }),
      { initialProps: { isStreaming: false } },
    );

    rerender({ isStreaming: true });

    expect(mockEngine.setAgentBusy).toHaveBeenCalledWith(true);
  });

  it('syncHeartbeatConfig() でエンジンが再起動される', () => {
    const onNotification = vi.fn();
    const { result } = renderHook(() =>
      useHeartbeat({ isStreaming: false, onNotification }),
    );

    // start は初期化時に 1 回呼ばれている
    expect(mockEngine.start).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.syncHeartbeatConfig();
    });

    // stop → start で再起動
    expect(mockEngine.stop).toHaveBeenCalled();
    expect(mockEngine.start).toHaveBeenCalledTimes(2);
  });

  it('SW からの config-changed メッセージで IDB → localStorage 同期する', async () => {
    const { loadConfigFromIDB } = await import('../store/configStore');
    const onNotification = vi.fn();
    renderHook(() => useHeartbeat({ isStreaming: false, onNotification }));

    // addEventListener に登録されたハンドラを取得
    expect(swAddEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    const handler = swAddEventListener.mock.calls.find(
      (call: unknown[]) => call[0] === 'message',
    )![1] as (event: MessageEvent) => void;

    // config-changed メッセージを発火
    await act(async () => {
      handler(new MessageEvent('message', { data: { type: 'config-changed' } }));
      // 非同期処理を待つ
      await vi.waitFor(() => {
        expect(loadConfigFromIDB).toHaveBeenCalled();
      });
    });
  });

  it('アンマウント時に SW message listener を解除する', () => {
    const onNotification = vi.fn();
    const { unmount } = renderHook(() =>
      useHeartbeat({ isStreaming: false, onNotification }),
    );

    unmount();

    expect(swRemoveEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
