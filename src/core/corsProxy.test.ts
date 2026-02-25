import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDomainAllowed, fetchViaProxy, registerProxyToken, CorsProxyError } from './corsProxy';
import type { ProxyConfig } from '../types';

// --- isDomainAllowed ---

describe('isDomainAllowed', () => {
  it('空の許可リストは全て許可する', () => {
    expect(isDomainAllowed('https://example.com/feed.xml', [])).toBe(true);
  });

  it('完全一致で許可する', () => {
    expect(isDomainAllowed('https://example.com/feed', ['example.com'])).toBe(true);
  });

  it('サブドメインも許可する', () => {
    expect(isDomainAllowed('https://blog.example.com/feed', ['example.com'])).toBe(true);
  });

  it('許可リストにないドメインを拒否する', () => {
    expect(isDomainAllowed('https://evil.com/feed', ['example.com'])).toBe(false);
  });

  it('不正な URL を拒否する', () => {
    expect(isDomainAllowed('not-a-url', ['example.com'])).toBe(false);
  });

  it('大文字小文字を区別しない', () => {
    expect(isDomainAllowed('https://Example.COM/feed', ['example.com'])).toBe(true);
  });
});

// --- fetchViaProxy ---

describe('fetchViaProxy', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const validConfig: ProxyConfig = {
    enabled: true,
    serverUrl: 'https://proxy.example.com',
    authToken: 'test-token',
    allowedDomains: [],
  };

  it('プロキシが無効のとき CorsProxyError を投げる', async () => {
    await expect(fetchViaProxy('https://example.com', { ...validConfig, enabled: false }))
      .rejects.toThrow(CorsProxyError);
  });

  it('トークン未設定のとき CorsProxyError を投げる', async () => {
    await expect(fetchViaProxy('https://example.com', { ...validConfig, authToken: '' }))
      .rejects.toThrow(CorsProxyError);
  });

  it('許可ドメインリストにないとき CorsProxyError を投げる', async () => {
    const config = { ...validConfig, allowedDomains: ['allowed.com'] };
    await expect(fetchViaProxy('https://notallowed.com', config))
      .rejects.toThrow('許可リストに含まれていません');
  });

  it('正常系でプロキシサーバーにリクエストを送る', async () => {
    const mockResponse = new Response('OK', { status: 200 });
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse);

    const result = await fetchViaProxy('https://example.com/feed.xml', validConfig);
    expect(result.status).toBe(200);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://proxy.example.com/proxy',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('プロキシサーバーがエラーを返した場合 CorsProxyError を投げる', async () => {
    const mockResponse = new Response(JSON.stringify({ error: '認証失敗' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse);

    await expect(fetchViaProxy('https://example.com', validConfig))
      .rejects.toThrow('認証失敗');
  });
});

// --- registerProxyToken ---

describe('registerProxyToken', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('正常系でトークンを返す', async () => {
    const mockResponse = new Response(JSON.stringify({ token: 'new-token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse);

    const token = await registerProxyToken('https://proxy.example.com', 'master-key');
    expect(token).toBe('new-token');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://proxy.example.com/register',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer master-key',
        }),
      }),
    );
  });

  it('認証失敗で CorsProxyError を投げる', async () => {
    const mockResponse = new Response(JSON.stringify({ error: '認証失敗' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse);

    await expect(registerProxyToken('https://proxy.example.com', 'wrong-key'))
      .rejects.toThrow('認証失敗');
  });
});
