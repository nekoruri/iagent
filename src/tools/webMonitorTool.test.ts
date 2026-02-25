import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { webMonitorTool } from './webMonitorTool';
import {
  saveMonitor,
  listMonitors,
  deleteMonitor,
  getMonitor,
  updateMonitor,
  computeHash,
} from '../store/monitorStore';

beforeEach(() => {
  __resetStores();
});

describe('webMonitorTool 定義', () => {
  it('ツール名が設定されている', () => {
    expect(webMonitorTool.name).toBe('web_monitor');
  });
});

describe('monitorStore 統合テスト', () => {
  it('監視対象を登録・取得できる', async () => {
    const hash = await computeHash('テストテキスト');
    const monitor = await saveMonitor({
      url: 'https://example.com',
      name: 'テスト監視',
      lastHash: hash,
      lastText: 'テストテキスト',
    });
    expect(monitor.id).toBeDefined();
    expect(monitor.name).toBe('テスト監視');

    const retrieved = await getMonitor(monitor.id);
    expect(retrieved!.url).toBe('https://example.com');
  });

  it('一覧を取得できる', async () => {
    await saveMonitor({ url: 'https://a.com', name: 'A', lastHash: 'h', lastText: 't' });
    await saveMonitor({ url: 'https://b.com', name: 'B', lastHash: 'h', lastText: 't' });
    const monitors = await listMonitors();
    expect(monitors).toHaveLength(2);
  });

  it('監視対象を更新できる', async () => {
    const monitor = await saveMonitor({ url: 'https://a.com', name: 'A', lastHash: 'old', lastText: 'old' });
    await updateMonitor(monitor.id, { lastHash: 'new', lastText: 'new text', lastCheckedAt: 5000 });
    const updated = await getMonitor(monitor.id);
    expect(updated!.lastHash).toBe('new');
    expect(updated!.lastCheckedAt).toBe(5000);
  });

  it('監視対象を削除できる', async () => {
    const monitor = await saveMonitor({ url: 'https://a.com', name: 'A', lastHash: 'h', lastText: 't' });
    expect(await deleteMonitor(monitor.id)).toBe(true);
    expect(await getMonitor(monitor.id)).toBeUndefined();
  });

  it('同じ URL+セレクタの重複はエラー', async () => {
    await saveMonitor({ url: 'https://a.com', name: 'A', lastHash: 'h', lastText: 't' });
    await expect(
      saveMonitor({ url: 'https://a.com', name: 'B', lastHash: 'h', lastText: 't' }),
    ).rejects.toThrow('既に監視中');
  });
});

describe('computeHash', () => {
  it('同じ入力で同じハッシュが生成される', async () => {
    const hash1 = await computeHash('hello');
    const hash2 = await computeHash('hello');
    expect(hash1).toBe(hash2);
  });

  it('異なる入力で異なるハッシュが生成される', async () => {
    const hash1 = await computeHash('hello');
    const hash2 = await computeHash('world');
    expect(hash1).not.toBe(hash2);
  });
});
