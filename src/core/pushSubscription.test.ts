import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribePush, unsubscribePush, getPushSubscription, registerPeriodicSync, unregisterPeriodicSync } from './pushSubscription';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock navigator.serviceWorker
const mockSubscription = {
  toJSON: vi.fn().mockReturnValue({ endpoint: 'https://push.example.com/sub1', keys: {} }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

const mockPushManager = {
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
};

const mockPeriodicSync = {
  register: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn().mockResolvedValue(undefined),
};

const mockRegistration = {
  pushManager: mockPushManager,
  periodicSync: mockPeriodicSync,
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve(mockRegistration),
    },
    writable: true,
    configurable: true,
  });
});

describe('subscribePush', () => {
  it('既存の Subscription があればサーバーに再登録して返す', async () => {
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await subscribePush('https://server.example.com');
    expect(result).toBe(mockSubscription);
    // TTL 延長のためサーバーに /subscribe を呼ぶ
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('https://server.example.com/subscribe', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('新規 Subscription を作成してサーバーに登録する', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null);
    mockPushManager.subscribe.mockResolvedValue(mockSubscription);

    // VAPID 公開鍵取得
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkDs-1xJDLfJB3oh0HRVNYoYEI2PxVCXQ78wIxRBNk' }),
    });

    // サーバー登録
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await subscribePush('https://server.example.com');
    expect(result).toBe(mockSubscription);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://server.example.com/vapid-public-key');
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://server.example.com/subscribe', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('既存 Subscription のサーバー再登録が HTTP エラーの場合、新規 Subscription を作成する', async () => {
    const newSubscription = {
      toJSON: vi.fn().mockReturnValue({ endpoint: 'https://push.example.com/sub2', keys: {} }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };

    // 1回目: 既存 Subscription あり
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
    // 既存の再登録 → HTTP 500
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    // VAPID 公開鍵取得
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkDs-1xJDLfJB3oh0HRVNYoYEI2PxVCXQ78wIxRBNk' }),
    });
    // 新規 Subscription のサーバー登録 → 成功
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockPushManager.subscribe.mockResolvedValue(newSubscription);

    const result = await subscribePush('https://server.example.com');

    // 既存 Subscription が unsubscribe される
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    // 新規 Subscription が返される
    expect(result).toBe(newSubscription);
    // fetch 3回: 再登録失敗 + VAPID取得 + 新規登録
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('既存 Subscription のサーバー再登録がネットワークエラーの場合、既存を継続利用する', async () => {
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await subscribePush('https://server.example.com');

    expect(result).toBe(mockSubscription);
    expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('VAPID 公開鍵取得失敗でエラーをスローする', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(subscribePush('https://server.example.com')).rejects.toThrow('VAPID 公開鍵の取得に失敗しました');
  });

  it('サーバー登録失敗で Subscription を解除してエラーをスローする', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null);
    mockPushManager.subscribe.mockResolvedValue(mockSubscription);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkDs-1xJDLfJB3oh0HRVNYoYEI2PxVCXQ78wIxRBNk' }),
    });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(subscribePush('https://server.example.com')).rejects.toThrow('サーバーへの Subscription 登録に失敗しました');
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
  });
});

describe('unsubscribePush', () => {
  it('Subscription がなければ何もしない', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null);
    await unsubscribePush('https://server.example.com');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('サーバーから削除してローカル解除する', async () => {
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
    mockFetch.mockResolvedValueOnce({ ok: true });

    await unsubscribePush('https://server.example.com');

    expect(mockFetch).toHaveBeenCalledWith('https://server.example.com/unsubscribe', expect.objectContaining({
      method: 'POST',
    }));
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
  });

  it('サーバー通信失敗でもローカル解除する', async () => {
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await unsubscribePush('https://server.example.com');
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
  });
});

describe('getPushSubscription', () => {
  it('Subscription があれば返す', async () => {
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
    const result = await getPushSubscription();
    expect(result).toBe(mockSubscription);
  });

  it('Subscription がなければ null を返す', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null);
    const result = await getPushSubscription();
    expect(result).toBeNull();
  });
});

describe('registerPeriodicSync', () => {
  it('Periodic Sync API がなければ false を返す', async () => {
    const regWithoutSync = { pushManager: mockPushManager };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve(regWithoutSync) },
      writable: true,
      configurable: true,
    });

    const result = await registerPeriodicSync();
    expect(result).toBe(false);
  });

  it('権限がなければ false を返す', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { ready: Promise.resolve(mockRegistration) },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      },
    });

    const result = await registerPeriodicSync();
    expect(result).toBe(false);
  });
});

describe('unregisterPeriodicSync', () => {
  it('エラーなく完了する', async () => {
    await expect(unregisterPeriodicSync()).resolves.toBeUndefined();
  });
});
