import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetConfigValue = vi.fn();
vi.mock('../core/config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
}));

import { webSearchTool } from './webSearchTool';

/** ツールを呼び出すヘルパー */
async function invoke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await webSearchTool.invoke({}, JSON.stringify(params));
  return JSON.parse(result);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('webSearchTool 定義', () => {
  it('ツール名が設定されている', () => {
    expect(webSearchTool.name).toBe('web_search');
  });
});

describe('webSearchTool invoke', () => {
  it('API キーが未設定の場合はエラーを返す', async () => {
    mockGetConfigValue.mockReturnValue('');
    const parsed = await invoke({ query: 'test' });
    expect(parsed.error).toContain('APIキーが設定されていません');
  });

  it('正常な検索結果を返す', async () => {
    mockGetConfigValue.mockReturnValue('brave-api-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        web: {
          results: [
            { title: 'Result 1', url: 'https://example.com/1', description: 'Desc 1' },
            { title: 'Result 2', url: 'https://example.com/2', description: 'Desc 2' },
          ],
        },
      }),
    }));

    const parsed = await invoke({ query: 'React チュートリアル' });
    expect(parsed.query).toBe('React チュートリアル');
    expect(parsed.results).toHaveLength(2);
    expect((parsed.results as Record<string, unknown>[])[0]).toEqual({
      title: 'Result 1',
      url: 'https://example.com/1',
      description: 'Desc 1',
    });

    // URL エンコードされたクエリで fetch が呼ばれる
    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain(encodeURIComponent('React チュートリアル'));
    expect(fetchCall[1].headers['X-Subscription-Token']).toBe('brave-api-key');
  });

  it('HTTP エラー時にエラーメッセージを返す', async () => {
    mockGetConfigValue.mockReturnValue('brave-api-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    const parsed = await invoke({ query: 'test' });
    expect(parsed.error).toBe('Brave Search API エラー: 429');
  });

  it('fetch 例外時にエラーメッセージを返す', async () => {
    mockGetConfigValue.mockReturnValue('brave-api-key');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ネットワークエラー')));

    const parsed = await invoke({ query: 'test' });
    expect(parsed.error).toBe('Web検索に失敗しました');
  });

  it('results が空の場合は空配列を返す', async () => {
    mockGetConfigValue.mockReturnValue('brave-api-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ web: { results: [] } }),
    }));

    const parsed = await invoke({ query: 'no-results' });
    expect(parsed.results).toEqual([]);
  });

  it('web.results が存在しない場合は空配列にフォールバックする', async () => {
    mockGetConfigValue.mockReturnValue('brave-api-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));

    const parsed = await invoke({ query: 'test' });
    expect(parsed.results).toEqual([]);
  });
});
