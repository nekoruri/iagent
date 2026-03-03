import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SwNotifier, SwClients, SubscriptionLike } from './swHandlers';
import {
  handlePush,
  handlePeriodicSync,
  handlePushSubscriptionChange,
  handleNotificationClick,
  getPushServerUrlFromIDB,
  urlBase64ToUint8ArraySW,
} from './swHandlers';

// --- heartbeatCommon のモック ---
const mockExecuteHeartbeatAndStore = vi.fn();
vi.mock('./heartbeatCommon', () => ({
  executeHeartbeatAndStore: (...args: unknown[]) => mockExecuteHeartbeatAndStore(...args),
}));

// --- fetch のモック ---
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// --- テスト用ヘルパー ---

function createMockNotifier(): SwNotifier & {
  showNotification: ReturnType<typeof vi.fn>;
  getNotifications: ReturnType<typeof vi.fn>;
} {
  return {
    showNotification: vi.fn().mockResolvedValue(undefined),
    getNotifications: vi.fn().mockResolvedValue([]),
  };
}

function createMockClients(): SwClients & {
  matchAll: ReturnType<typeof vi.fn>;
  openWindow: ReturnType<typeof vi.fn>;
} {
  return {
    matchAll: vi.fn().mockResolvedValue([]),
    openWindow: vi.fn().mockResolvedValue(null),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

// ============================================================
// handlePush
// ============================================================
describe('handlePush', () => {
  it('heartbeat-wake 以外の type は無視する', async () => {
    const notifier = createMockNotifier();
    await handlePush({ type: 'some-other-type' }, notifier);

    expect(mockExecuteHeartbeatAndStore).not.toHaveBeenCalled();
    expect(notifier.showNotification).not.toHaveBeenCalled();
  });

  it('type なし（undefined）は heartbeat-wake として扱う', async () => {
    const notifier = createMockNotifier();
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

    const promise = handlePush({}, notifier);
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(mockExecuteHeartbeatAndStore).toHaveBeenCalledWith('', 'push');
  });

  it('data が null でも正常に処理する', async () => {
    const notifier = createMockNotifier();
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

    const promise = handlePush(null, notifier);
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(mockExecuteHeartbeatAndStore).toHaveBeenCalledWith('', 'push');
  });

  it('heartbeat-wake の場合は executeHeartbeatAndStore を呼ぶ', async () => {
    const notifier = createMockNotifier();
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

    const promise = handlePush({ type: 'heartbeat-wake' }, notifier);
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(mockExecuteHeartbeatAndStore).toHaveBeenCalledWith('', 'push');
  });

  it('結果ありの場合はサマリー付き通知を表示する', async () => {
    const notifier = createMockNotifier();
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [
      { taskId: 'task-1', timestamp: Date.now(), hasChanges: true, summary: 'ニュース更新あり' },
      { taskId: 'task-2', timestamp: Date.now(), hasChanges: true, summary: 'カレンダー通知' },
    ], configChanged: false });

    await handlePush({ type: 'heartbeat-wake' }, notifier);

    expect(notifier.showNotification).toHaveBeenCalledWith(
      'iAgent Heartbeat [push]',
      expect.objectContaining({
        body: 'ニュース更新あり\nカレンダー通知',
        tag: 'heartbeat-result',
      }),
    );
  });

  it('結果なしの場合はサイレント通知を出して閉じる', async () => {
    const mockNotification = { close: vi.fn() };
    const notifier = createMockNotifier();
    notifier.getNotifications.mockResolvedValue([mockNotification]);
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

    const promise = handlePush({ type: 'heartbeat-wake' }, notifier);
    // setTimeout(100ms) を進める
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(notifier.showNotification).toHaveBeenCalledWith(
      'iAgent [push]',
      expect.objectContaining({
        tag: 'heartbeat-silent',
        silent: true,
      }),
    );
    expect(notifier.getNotifications).toHaveBeenCalledWith({ tag: 'heartbeat-silent' });
    expect(mockNotification.close).toHaveBeenCalled();
  });

  it('configChanged 時にクライアントへ postMessage する', async () => {
    const notifier = createMockNotifier();
    const mockClient = { url: 'https://app.example.com/', postMessage: vi.fn() };
    const clients = createMockClients();
    clients.matchAll.mockResolvedValue([mockClient]);
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: true });

    const promise = handlePush({ type: 'heartbeat-wake' }, notifier, clients);
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(mockClient.postMessage).toHaveBeenCalledWith({ type: 'config-changed' });
  });

  it('configChanged が false の場合はクライアントに通知しない', async () => {
    const notifier = createMockNotifier();
    const mockClient = { url: 'https://app.example.com/', postMessage: vi.fn() };
    const clients = createMockClients();
    clients.matchAll.mockResolvedValue([mockClient]);
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

    const promise = handlePush({ type: 'heartbeat-wake' }, notifier, clients);
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(mockClient.postMessage).not.toHaveBeenCalled();
  });

  it('executeHeartbeatAndStore がエラーを投げた場合はエラー通知を表示する', async () => {
    const notifier = createMockNotifier();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExecuteHeartbeatAndStore.mockRejectedValue(new Error('API エラー'));

    await handlePush({ type: 'heartbeat-wake' }, notifier);

    expect(notifier.showNotification).toHaveBeenCalledWith(
      'iAgent',
      expect.objectContaining({
        body: 'Heartbeat チェックでエラーが発生しました',
        tag: 'heartbeat-error',
      }),
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ============================================================
// handlePeriodicSync
// ============================================================
describe('handlePeriodicSync', () => {
  it('結果ありの場合は通知を表示する', async () => {
    const notifier = createMockNotifier();
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [
      { taskId: 'task-1', timestamp: Date.now(), hasChanges: true, summary: '定期チェック結果' },
    ], configChanged: false });

    await handlePeriodicSync(notifier);

    expect(mockExecuteHeartbeatAndStore).toHaveBeenCalledWith('', 'periodic-sync');
    expect(notifier.showNotification).toHaveBeenCalledWith(
      'iAgent Heartbeat [periodic-sync]',
      expect.objectContaining({
        body: '定期チェック結果',
        tag: 'heartbeat-result',
      }),
    );
  });

  it('結果なしの場合は通知を表示しない', async () => {
    const notifier = createMockNotifier();
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: false });

    await handlePeriodicSync(notifier);

    expect(notifier.showNotification).not.toHaveBeenCalled();
  });

  it('configChanged 時にクライアントへ postMessage する', async () => {
    const notifier = createMockNotifier();
    const mockClient = { url: 'https://app.example.com/', postMessage: vi.fn() };
    const clients = createMockClients();
    clients.matchAll.mockResolvedValue([mockClient]);
    mockExecuteHeartbeatAndStore.mockResolvedValue({ results: [], configChanged: true });

    await handlePeriodicSync(notifier, clients);

    expect(mockClient.postMessage).toHaveBeenCalledWith({ type: 'config-changed' });
  });

  it('エラー時は console.error のみ（通知なし）', async () => {
    const notifier = createMockNotifier();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExecuteHeartbeatAndStore.mockRejectedValue(new Error('ネットワークエラー'));

    await handlePeriodicSync(notifier);

    expect(consoleSpy).toHaveBeenCalledWith('[SW] Periodic sync エラー:', expect.any(Error));
    expect(notifier.showNotification).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ============================================================
// handlePushSubscriptionChange
// ============================================================
describe('handlePushSubscriptionChange', () => {
  const mockSubscribeFn = vi.fn();

  // indexedDB をモックして getPushServerUrlFromIDB の結果を制御する
  function stubIDB(configData?: Record<string, unknown>): void {
    const mockStore = {
      get: vi.fn().mockImplementation(() => {
        const request = { result: configData, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
        // microtask で onsuccess を呼ぶ
        Promise.resolve().then(() => request.onsuccess?.());
        return request;
      }),
    };
    const mockTx = { objectStore: vi.fn().mockReturnValue(mockStore) };
    const mockDb = {
      transaction: vi.fn().mockReturnValue(mockTx),
      close: vi.fn(),
    };
    vi.stubGlobal('indexedDB', {
      open: vi.fn().mockImplementation(() => {
        const request = { result: mockDb, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
        Promise.resolve().then(() => request.onsuccess?.());
        return request;
      }),
    });
  }

  beforeEach(() => {
    mockSubscribeFn.mockReset();
  });

  it('serverUrl が設定されていない場合はスキップする', async () => {
    stubIDB(undefined); // config なし
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await handlePushSubscriptionChange(undefined, undefined, mockSubscribeFn);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Push サーバー URL が設定されていない'),
    );
    expect(mockFetch).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('oldSubscription がある場合はサーバーから削除する', async () => {
    stubIDB({ key: 'app-config', push: { serverUrl: 'https://push.example.com' } });
    mockFetch.mockResolvedValue({ ok: true });
    const oldSub: SubscriptionLike = { toJSON: () => ({ endpoint: 'https://old-endpoint' }) };
    const newSub: SubscriptionLike = { toJSON: () => ({ endpoint: 'https://new-endpoint' }) };

    await handlePushSubscriptionChange(oldSub, newSub, mockSubscribeFn);

    // unsubscribe 呼び出し
    expect(mockFetch).toHaveBeenCalledWith(
      'https://push.example.com/unsubscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ subscription: { endpoint: 'https://old-endpoint' } }),
      }),
    );
    // subscribe 呼び出し
    expect(mockFetch).toHaveBeenCalledWith(
      'https://push.example.com/subscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ subscription: { endpoint: 'https://new-endpoint' } }),
      }),
    );
  });

  it('newSubscription がある場合は subscribeFn を呼ばずにサーバー登録する', async () => {
    stubIDB({ key: 'app-config', push: { serverUrl: 'https://push.example.com' } });
    mockFetch.mockResolvedValue({ ok: true });
    const newSub: SubscriptionLike = { toJSON: () => ({ endpoint: 'https://new-endpoint' }) };

    await handlePushSubscriptionChange(undefined, newSub, mockSubscribeFn);

    expect(mockSubscribeFn).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://push.example.com/subscribe',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('newSubscription がない場合は VAPID 鍵取得 + 手動再購読する', async () => {
    stubIDB({ key: 'app-config', push: { serverUrl: 'https://push.example.com' } });
    // VAPID 公開鍵レスポンス
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: 'BDd3_hVL9fZi9Ybo2UUzA284WG5FZR30_95YeZJsiApwXKpNcF1rRPF3foIiBHXRdJI2Qhumhf6_LFTeZaNndIo' }),
    });
    const createdSub: SubscriptionLike = { toJSON: () => ({ endpoint: 'https://created-endpoint' }) };
    mockSubscribeFn.mockResolvedValue(createdSub);
    // subscribe レスポンス
    mockFetch.mockResolvedValueOnce({ ok: true });

    await handlePushSubscriptionChange(undefined, undefined, mockSubscribeFn);

    expect(mockSubscribeFn).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    expect(mockFetch).toHaveBeenCalledWith(
      'https://push.example.com/subscribe',
      expect.objectContaining({
        body: JSON.stringify({ subscription: { endpoint: 'https://created-endpoint' } }),
      }),
    );
  });

  it('VAPID 公開鍵取得失敗時はエラーログを出力する', async () => {
    stubIDB({ key: 'app-config', push: { serverUrl: 'https://push.example.com' } });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handlePushSubscriptionChange(undefined, undefined, mockSubscribeFn);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[SW] pushsubscriptionchange ハンドラエラー:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('subscribe レスポンスが失敗した場合はエラーログを出力する', async () => {
    stubIDB({ key: 'app-config', push: { serverUrl: 'https://push.example.com' } });
    const newSub: SubscriptionLike = { toJSON: () => ({ endpoint: 'https://new-endpoint' }) };
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handlePushSubscriptionChange(undefined, newSub, mockSubscribeFn);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[SW] 新 Subscription のサーバー登録に失敗:',
      503,
    );
    consoleSpy.mockRestore();
  });

  it('serverUrl 末尾のスラッシュを除去する', async () => {
    stubIDB({ key: 'app-config', push: { serverUrl: 'https://push.example.com///' } });
    mockFetch.mockResolvedValue({ ok: true });
    const newSub: SubscriptionLike = { toJSON: () => ({ endpoint: 'https://endpoint' }) };

    await handlePushSubscriptionChange(undefined, newSub, mockSubscribeFn);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://push.example.com/subscribe',
      expect.any(Object),
    );
  });
});

// ============================================================
// handleNotificationClick
// ============================================================
describe('handleNotificationClick', () => {
  it('同一オリジンの既存タブがあればフォーカスする', async () => {
    const mockClient = { url: 'https://app.example.com/chat', focus: vi.fn().mockResolvedValue(undefined), postMessage: vi.fn() };
    const clients = createMockClients();
    clients.matchAll.mockResolvedValue([mockClient]);

    await handleNotificationClick({ url: '/' }, 'https://app.example.com', clients);

    expect(mockClient.focus).toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it('既存タブがない場合は新規タブを開く', async () => {
    const clients = createMockClients();
    clients.matchAll.mockResolvedValue([]);

    await handleNotificationClick({ url: '/heartbeat' }, 'https://app.example.com', clients);

    expect(clients.openWindow).toHaveBeenCalledWith('/heartbeat');
  });

  it('別オリジンのタブしかない場合は新規タブを開く', async () => {
    const mockClient = { url: 'https://other.example.com/', focus: vi.fn(), postMessage: vi.fn() };
    const clients = createMockClients();
    clients.matchAll.mockResolvedValue([mockClient]);

    await handleNotificationClick({ url: '/' }, 'https://app.example.com', clients);

    expect(mockClient.focus).not.toHaveBeenCalled();
    expect(clients.openWindow).toHaveBeenCalledWith('/');
  });

  it('notificationData が undefined の場合はルートを開く', async () => {
    const clients = createMockClients();
    clients.matchAll.mockResolvedValue([]);

    await handleNotificationClick(undefined, 'https://app.example.com', clients);

    expect(clients.openWindow).toHaveBeenCalledWith('/');
  });

  it('matchAll に正しいオプションを渡す', async () => {
    const clients = createMockClients();

    await handleNotificationClick(undefined, 'https://app.example.com', clients);

    expect(clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  });
});

// ============================================================
// getPushServerUrlFromIDB
// ============================================================
describe('getPushServerUrlFromIDB', () => {
  function stubIDB(configData?: Record<string, unknown>, shouldFail = false): void {
    if (shouldFail) {
      vi.stubGlobal('indexedDB', {
        open: vi.fn().mockImplementation(() => {
          const request = { result: null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
          Promise.resolve().then(() => request.onerror?.());
          return request;
        }),
      });
      return;
    }

    const mockStore = {
      get: vi.fn().mockImplementation(() => {
        const request = { result: configData, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
        Promise.resolve().then(() => request.onsuccess?.());
        return request;
      }),
    };
    const mockTx = { objectStore: vi.fn().mockReturnValue(mockStore) };
    const mockDb = {
      transaction: vi.fn().mockReturnValue(mockTx),
      close: vi.fn(),
    };
    vi.stubGlobal('indexedDB', {
      open: vi.fn().mockImplementation(() => {
        const request = { result: mockDb, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
        Promise.resolve().then(() => request.onsuccess?.());
        return request;
      }),
    });
  }

  it('config に push.serverUrl がある場合はその値を返す', async () => {
    stubIDB({ key: 'app-config', push: { serverUrl: 'https://push.example.com' } });

    const result = await getPushServerUrlFromIDB();

    expect(result).toBe('https://push.example.com');
  });

  it('config がない場合は null を返す', async () => {
    stubIDB(undefined);

    const result = await getPushServerUrlFromIDB();

    expect(result).toBeNull();
  });

  it('push.serverUrl が空文字の場合は null を返す', async () => {
    stubIDB({ key: 'app-config', push: { serverUrl: '' } });

    const result = await getPushServerUrlFromIDB();

    expect(result).toBeNull();
  });

  it('push プロパティがない場合は null を返す', async () => {
    stubIDB({ key: 'app-config' });

    const result = await getPushServerUrlFromIDB();

    expect(result).toBeNull();
  });

  it('IndexedDB オープンエラー時は null を返す', async () => {
    stubIDB(undefined, true);

    const result = await getPushServerUrlFromIDB();

    expect(result).toBeNull();
  });
});

// ============================================================
// urlBase64ToUint8ArraySW
// ============================================================
describe('urlBase64ToUint8ArraySW', () => {
  it('Base64 URL エンコードされた文字列を Uint8Array に変換する', () => {
    // "Hello" の Base64 URL エンコード
    const base64url = 'SGVsbG8';
    const result = urlBase64ToUint8ArraySW(base64url);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(5);
    expect(String.fromCharCode(...result)).toBe('Hello');
  });

  it('パディングが必要な場合でも正しく変換する', () => {
    // "Hi" の Base64 URL エンコード（パディングなし）
    const base64url = 'SGk';
    const result = urlBase64ToUint8ArraySW(base64url);

    expect(String.fromCharCode(...result)).toBe('Hi');
  });

  it('URL セーフ文字（-_）を標準 Base64 文字（+/）に変換する', () => {
    // 4 文字の Base64（3 バイトに対応）
    const standardBase64 = 'A+B/'; // 標準 Base64
    const urlSafeBase64 = 'A-B_'; // URL セーフ Base64
    const result = urlBase64ToUint8ArraySW(urlSafeBase64);
    const expected = Uint8Array.from(atob(standardBase64), (c) => c.charCodeAt(0));

    expect(result).toEqual(expected);
  });

  it('空文字列の場合は空の Uint8Array を返す', () => {
    const result = urlBase64ToUint8ArraySW('');
    expect(result.length).toBe(0);
  });
});
