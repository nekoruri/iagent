import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { useFeedPanel } from './useFeedPanel';
import { saveFeed, saveFeedItems, updateItemTier } from '../store/feedStore';

beforeEach(() => {
  __resetStores();
});

async function seedFeedWithItems() {
  const feed = await saveFeed({ url: 'https://example.com/rss', title: 'テストフィード' });
  await saveFeedItems(feed.id, [
    { guid: 'g1', title: '必読記事', link: 'https://example.com/1', content: '', publishedAt: Date.now() - 1000 },
    { guid: 'g2', title: 'おすすめ記事', link: 'https://example.com/2', content: '', publishedAt: Date.now() - 2000 },
    { guid: 'g3', title: 'スキップ記事', link: 'https://example.com/3', content: '', publishedAt: Date.now() - 3000 },
  ]);

  // listClassifiedItems を使うには tier を設定する必要がある
  const { listFeedItems } = await import('../store/feedStore');
  const items = await listFeedItems(feed.id);
  await updateItemTier(items[0].id, 'must-read');
  await updateItemTier(items[1].id, 'recommended');
  await updateItemTier(items[2].id, 'skip');

  return { feed, itemIds: items.map((i) => i.id) };
}

describe('useFeedPanel', () => {
  it('toggle でパネルの開閉を切り替えできる', async () => {
    const { result } = renderHook(() => useFeedPanel());

    expect(result.current.isOpen).toBe(false);

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('close でパネルを閉じる', async () => {
    const { result } = renderHook(() => useFeedPanel());

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    await act(async () => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('changeTier で tier フィルタを切り替えできる', async () => {
    await seedFeedWithItems();

    const { result } = renderHook(() => useFeedPanel());

    // 初期ロード完了を待つ
    await act(async () => {
      await result.current.refresh();
    });
    // skip 除外なので 2 件
    expect(result.current.items).toHaveLength(2);

    await act(async () => {
      result.current.changeTier('must-read');
    });

    expect(result.current.selectedTier).toBe('must-read');
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].title).toBe('必読記事');
  });

  it('handleMarkRead で記事を既読にできる', async () => {
    const { itemIds } = await seedFeedWithItems();

    const { result } = renderHook(() => useFeedPanel());

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.items).toHaveLength(2);

    // must-read 記事を既読にする（items[0] は publishedAt が新しい方）
    const mustReadItem = result.current.items.find((i) => i.tier === 'must-read');
    await act(async () => {
      await result.current.handleMarkRead(mustReadItem!.id);
    });
    expect(result.current.items).toHaveLength(1);
  });

  it('feedMap でフィード名を逆引きできる', async () => {
    const { feed } = await seedFeedWithItems();

    const { result } = renderHook(() => useFeedPanel());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.feedMap.get(feed.id)?.title).toBe('テストフィード');
  });

  it('unreadCount が未読記事数を返す', async () => {
    await seedFeedWithItems();

    const { result } = renderHook(() => useFeedPanel());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.unreadCount).toBe(2);
  });

  it('tier フィルタ中でも unreadCount は全未読数を返す', async () => {
    await seedFeedWithItems();

    const { result } = renderHook(() => useFeedPanel());

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.unreadCount).toBe(2);

    // must-read のみにフィルタ
    await act(async () => {
      result.current.changeTier('must-read');
    });
    // items は 1 件だが unreadCount は全 tier の 2 件
    expect(result.current.items).toHaveLength(1);
    expect(result.current.unreadCount).toBe(2);
  });
});
