import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import {
  saveMonitor,
  getMonitor,
  listMonitors,
  updateMonitor,
  deleteMonitor,
  computeHash,
} from './monitorStore';

beforeEach(() => {
  __resetStores();
});

describe('saveMonitor', () => {
  it('監視対象を保存して返却値を検証する', async () => {
    const monitor = await saveMonitor({
      url: 'https://example.com',
      name: 'テスト監視',
      lastHash: 'abc123',
      lastText: 'テストテキスト',
    });
    expect(monitor.id).toBeDefined();
    expect(monitor.url).toBe('https://example.com');
    expect(monitor.name).toBe('テスト監視');
    expect(monitor.lastHash).toBe('abc123');
    expect(monitor.lastCheckedAt).toBeGreaterThan(0);
  });

  it('セレクタ付きで保存できる', async () => {
    const monitor = await saveMonitor({
      url: 'https://example.com',
      name: 'セレクタ監視',
      selector: '#main-content',
      lastHash: 'abc123',
      lastText: 'テスト',
    });
    expect(monitor.selector).toBe('#main-content');
  });

  it('同じ URL+セレクタの重複登録でエラー', async () => {
    await saveMonitor({ url: 'https://example.com', name: 'A', lastHash: 'a', lastText: 'a' });
    await expect(
      saveMonitor({ url: 'https://example.com', name: 'B', lastHash: 'b', lastText: 'b' }),
    ).rejects.toThrow('既に監視中');
  });

  it('同じ URL でもセレクタが異なれば登録できる', async () => {
    await saveMonitor({ url: 'https://example.com', name: 'A', selector: '#a', lastHash: 'a', lastText: 'a' });
    const b = await saveMonitor({ url: 'https://example.com', name: 'B', selector: '#b', lastHash: 'b', lastText: 'b' });
    expect(b.id).toBeDefined();
  });

  it('MAX_MONITORS 超過でエラー', async () => {
    for (let i = 0; i < 20; i++) {
      await saveMonitor({ url: `https://example.com/${i}`, name: `M${i}`, lastHash: `h${i}`, lastText: `t${i}` });
    }
    await expect(
      saveMonitor({ url: 'https://example.com/21', name: 'Over', lastHash: 'h', lastText: 't' }),
    ).rejects.toThrow('上限');
  });

  it('lastText が 10KB に切り詰められる', async () => {
    const longText = 'a'.repeat(20000);
    const monitor = await saveMonitor({
      url: 'https://example.com',
      name: 'テスト',
      lastHash: 'h',
      lastText: longText,
    });
    expect(monitor.lastText.length).toBeLessThanOrEqual(10 * 1024);
  });
});

describe('getMonitor / listMonitors', () => {
  it('保存した監視対象を取得できる', async () => {
    const saved = await saveMonitor({ url: 'https://a.com', name: 'A', lastHash: 'h', lastText: 't' });
    const retrieved = await getMonitor(saved.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('A');
  });

  it('全件一覧を取得できる', async () => {
    await saveMonitor({ url: 'https://a.com', name: 'A', lastHash: 'h', lastText: 't' });
    await saveMonitor({ url: 'https://b.com', name: 'B', lastHash: 'h', lastText: 't' });
    const monitors = await listMonitors();
    expect(monitors).toHaveLength(2);
  });
});

describe('updateMonitor', () => {
  it('監視対象のフィールドを更新できる', async () => {
    const saved = await saveMonitor({ url: 'https://a.com', name: 'A', lastHash: 'old', lastText: 'old' });
    await updateMonitor(saved.id, { lastHash: 'new', lastText: 'new text', lastCheckedAt: 9999 });
    const updated = await getMonitor(saved.id);
    expect(updated!.lastHash).toBe('new');
    expect(updated!.lastText).toBe('new text');
    expect(updated!.lastCheckedAt).toBe(9999);
  });

  it('存在しないIDでエラー', async () => {
    await expect(updateMonitor('non-existent', { lastHash: 'x' })).rejects.toThrow('見つかりません');
  });
});

describe('deleteMonitor', () => {
  it('監視対象を削除できる', async () => {
    const saved = await saveMonitor({ url: 'https://a.com', name: 'A', lastHash: 'h', lastText: 't' });
    expect(await deleteMonitor(saved.id)).toBe(true);
    expect(await getMonitor(saved.id)).toBeUndefined();
  });

  it('存在しないIDで false を返す', async () => {
    expect(await deleteMonitor('non-existent')).toBe(false);
  });
});

describe('computeHash', () => {
  it('同じテキストから同じハッシュが生成される', async () => {
    const hash1 = await computeHash('テスト文字列');
    const hash2 = await computeHash('テスト文字列');
    expect(hash1).toBe(hash2);
  });

  it('異なるテキストから異なるハッシュが生成される', async () => {
    const hash1 = await computeHash('テキストA');
    const hash2 = await computeHash('テキストB');
    expect(hash1).not.toBe(hash2);
  });

  it('ハッシュが64文字の16進数文字列', async () => {
    const hash = await computeHash('テスト');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
