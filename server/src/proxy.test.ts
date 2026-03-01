import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPrivateIP, validateProxyUrl, handleRegister, handleProxy } from './proxy';
import type { Env } from './index';

// --- isPrivateIP ---

describe('isPrivateIP', () => {
  it('localhost を検出する', () => {
    expect(isPrivateIP('localhost')).toBe(true);
    expect(isPrivateIP('[::1]')).toBe(true);
  });

  it('127.x.x.x を検出する', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true);
    expect(isPrivateIP('127.255.255.255')).toBe(true);
  });

  it('10.x.x.x を検出する', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true);
    expect(isPrivateIP('10.255.255.255')).toBe(true);
  });

  it('172.16-31.x.x を検出する', () => {
    expect(isPrivateIP('172.16.0.1')).toBe(true);
    expect(isPrivateIP('172.31.255.255')).toBe(true);
    expect(isPrivateIP('172.15.0.1')).toBe(false);
    expect(isPrivateIP('172.32.0.1')).toBe(false);
  });

  it('192.168.x.x を検出する', () => {
    expect(isPrivateIP('192.168.0.1')).toBe(true);
    expect(isPrivateIP('192.168.255.255')).toBe(true);
  });

  it('169.254.x.x (リンクローカル) を検出する', () => {
    expect(isPrivateIP('169.254.0.1')).toBe(true);
  });

  it('0.0.0.0 を検出する', () => {
    expect(isPrivateIP('0.0.0.0')).toBe(true);
  });

  it('パブリック IP を許可する', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false);
    expect(isPrivateIP('203.0.113.1')).toBe(false);
    expect(isPrivateIP('example.com')).toBe(false);
  });

  // IPv6 テスト
  it('IPv6 ループバック (::1) を検出する', () => {
    expect(isPrivateIP('::1')).toBe(true);
    expect(isPrivateIP('[::1]')).toBe(true);
  });

  it('IPv6 未指定アドレス (::) を検出する', () => {
    expect(isPrivateIP('::')).toBe(true);
  });

  it('IPv6 ULA (fc00::/7) を検出する', () => {
    expect(isPrivateIP('fc00::1')).toBe(true);
    expect(isPrivateIP('fd12:3456:789a::1')).toBe(true);
  });

  it('IPv6 リンクローカル (fe80::/10) を検出する', () => {
    expect(isPrivateIP('fe80::1')).toBe(true);
    expect(isPrivateIP('fe80::a1:b2c3')).toBe(true);
  });

  it('IPv4-mapped IPv6 のプライベート IP を検出する', () => {
    expect(isPrivateIP('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
  });

  it('IPv4-mapped IPv6 のパブリック IP を許可する', () => {
    expect(isPrivateIP('::ffff:8.8.8.8')).toBe(false);
  });

  it('IPv4-mapped IPv6 の16進表記プライベート IP を検出する', () => {
    expect(isPrivateIP('::ffff:c0a8:0101')).toBe(true);  // 192.168.1.1
    expect(isPrivateIP('::ffff:7f00:1')).toBe(true);      // 127.0.0.1
    expect(isPrivateIP('::ffff:0a00:1')).toBe(true);      // 10.0.0.1
  });

  it('IPv4-mapped IPv6 の16進表記パブリック IP を許可する', () => {
    expect(isPrivateIP('::ffff:0808:0808')).toBe(false);  // 8.8.8.8
  });

  it('IPv6 パブリックアドレスを許可する', () => {
    expect(isPrivateIP('2001:db8::1')).toBe(false);
    expect(isPrivateIP('2607:f8b0:4004:800::200e')).toBe(false);
  });
});

// --- validateProxyUrl ---

describe('validateProxyUrl', () => {
  it('有効な HTTPS URL を受理する', () => {
    const result = validateProxyUrl('https://example.com/feed.xml');
    expect(result.valid).toBe(true);
  });

  it('HTTP URL を拒否する', () => {
    const result = validateProxyUrl('http://example.com/feed.xml');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('HTTPS');
    }
  });

  it('不正な URL を拒否する', () => {
    const result = validateProxyUrl('not-a-url');
    expect(result.valid).toBe(false);
  });

  it('プライベート IP を拒否する', () => {
    const result = validateProxyUrl('https://192.168.1.1/secret');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('プライベート');
    }
  });

  it('localhost を拒否する', () => {
    const result = validateProxyUrl('https://localhost/secret');
    expect(result.valid).toBe(false);
  });
});

// --- KV モック ---

function createMockKV(store: Record<string, string> = {}): KVNamespace {
  return {
    get: vi.fn(async (key: string) => store[key] ?? null),
    put: vi.fn(async (key: string, value: string) => { store[key] = value; }),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: '' })),
    getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
  } as unknown as KVNamespace;
}

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    SUBSCRIPTIONS: createMockKV(),
    RATE_LIMIT: createMockKV(),
    VAPID_PUBLIC_KEY: 'test-public',
    VAPID_PRIVATE_KEY: 'test-private',
    VAPID_SUBJECT: 'mailto:test@example.com',
    PROXY_MASTER_KEY: 'test-master-key',
    ...overrides,
  };
}

function createRequest(path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Request {
  return new Request(`https://worker.example.com${path}`, {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.1',
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

// --- handleRegister ---

describe('handleRegister', () => {
  it('正しいマスターキーでトークンを発行する', async () => {
    const env = createMockEnv();
    const req = createRequest('/register', {
      headers: { Authorization: 'Bearer test-master-key' },
    });
    const res = await handleRegister(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string };
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');
    // KV にトークンが保存されたことを確認
    expect(env.RATE_LIMIT.put).toHaveBeenCalledWith(
      expect.stringContaining('token:'),
      '1',
      expect.objectContaining({ expirationTtl: expect.any(Number) }),
    );
  });

  it('不正なマスターキーで 401 を返す', async () => {
    const env = createMockEnv();
    const req = createRequest('/register', {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    const res = await handleRegister(req, env);
    expect(res.status).toBe(401);
  });

  it('Authorization ヘッダーなしで 401 を返す', async () => {
    const env = createMockEnv();
    const req = createRequest('/register', {});
    const res = await handleRegister(req, env);
    expect(res.status).toBe(401);
  });

  it('KV 書き込み失敗時に 503 を返す', async () => {
    const kv = createMockKV();
    vi.mocked(kv.put).mockRejectedValue(new Error('KV put() limit exceeded for the day.'));
    const env = createMockEnv({ RATE_LIMIT: kv });
    const req = createRequest('/register', {
      headers: { Authorization: 'Bearer test-master-key' },
    });
    const res = await handleRegister(req, env);
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('KV');
  });
});

// --- handleProxy ---

describe('handleProxy', () => {
  let env: Env;

  beforeEach(() => {
    const store: Record<string, string> = { 'token:valid-token': '1' };
    env = createMockEnv({
      RATE_LIMIT: createMockKV(store),
    });
  });

  it('無効なトークンで 401 を返す', async () => {
    const req = createRequest('/proxy', {
      headers: { Authorization: 'Bearer invalid-token' },
      body: { url: 'https://example.com' },
    });
    const res = await handleProxy(req, env);
    expect(res.status).toBe(401);
  });

  it('トークンなしで 401 を返す', async () => {
    const req = createRequest('/proxy', {
      body: { url: 'https://example.com' },
    });
    const res = await handleProxy(req, env);
    expect(res.status).toBe(401);
  });

  it('url フィールドなしで 400 を返す', async () => {
    const req = createRequest('/proxy', {
      headers: { Authorization: 'Bearer valid-token' },
      body: {},
    });
    const res = await handleProxy(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('url');
  });

  it('プライベート IP 宛の URL で 400 を返す', async () => {
    const req = createRequest('/proxy', {
      headers: { Authorization: 'Bearer valid-token' },
      body: { url: 'https://10.0.0.1/secret' },
    });
    const res = await handleProxy(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('プライベート');
  });

  it('HTTP URL で 400 を返す', async () => {
    const req = createRequest('/proxy', {
      headers: { Authorization: 'Bearer valid-token' },
      body: { url: 'http://example.com' },
    });
    const res = await handleProxy(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('HTTPS');
  });

  it('レート制限超過で 429 を返す', async () => {
    // KV の get が既にレート超過を示す値を返すようにモック
    const store: Record<string, string> = { 'token:valid-token': '1', 'rate:203.0.113.1': '30' };
    env = createMockEnv({
      RATE_LIMIT: createMockKV(store),
    });

    const req = createRequest('/proxy', {
      headers: { Authorization: 'Bearer valid-token' },
      body: { url: 'https://example.com' },
    });
    const res = await handleProxy(req, env);
    expect(res.status).toBe(429);
  });

  it('KV 障害時はレート制限をスキップして処理を続行する', async () => {
    const kv = createMockKV({ 'token:valid-token': '1' });
    vi.mocked(kv.get).mockImplementation(async (key: string) => {
      if ((key as string).startsWith('rate:')) throw new Error('KV read error');
      return key === 'token:valid-token' ? '1' : null;
    });
    env = createMockEnv({ RATE_LIMIT: kv });

    const req = createRequest('/proxy', {
      headers: { Authorization: 'Bearer valid-token' },
      body: { url: 'https://10.0.0.1/secret' }, // SSRF で 400 になるが 429/500 にはならない
    });
    const res = await handleProxy(req, env);
    // レート制限エラー (429) や内部エラー (500) ではなく、URL バリデーションの 400 が返る
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('プライベート');
  });

  it('レートカウントが不正な値のとき 0 にフォールバックする', async () => {
    const store: Record<string, string> = { 'token:valid-token': '1', 'rate:203.0.113.1': 'corrupted' };
    env = createMockEnv({
      RATE_LIMIT: createMockKV(store),
    });

    const req = createRequest('/proxy', {
      headers: { Authorization: 'Bearer valid-token' },
      body: { url: 'https://10.0.0.1/secret' },
    });
    const res = await handleProxy(req, env);
    // NaN でレート制限が壊れるのではなく、0 にフォールバックして正常に処理が続く
    expect(res.status).toBe(400); // URL バリデーションの 400
    expect(res.status).not.toBe(429);
  });
});
