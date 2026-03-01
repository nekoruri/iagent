import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import {
  saveFeed,
  getFeed,
  listFeeds,
  deleteFeed,
  saveFeedItems,
  listFeedItems,
  markItemRead,
  listUnclassifiedItems,
  listClassifiedItems,
  updateItemTier,
} from './feedStore';

beforeEach(() => {
  __resetStores();
});

describe('saveFeed', () => {
  it('フィードを保存して返却値を検証する', async () => {
    const feed = await saveFeed({
      url: 'https://example.com/feed.xml',
      title: 'テストフィード',
      siteUrl: 'https://example.com',
    });
    expect(feed.id).toBeDefined();
    expect(feed.url).toBe('https://example.com/feed.xml');
    expect(feed.title).toBe('テストフィード');
    expect(feed.itemCount).toBe(0);
    expect(feed.lastFetchedAt).toBe(0);
  });

  it('同じURLの重複登録でエラー', async () => {
    await saveFeed({ url: 'https://example.com/feed.xml', title: 'A' });
    await expect(saveFeed({ url: 'https://example.com/feed.xml', title: 'B' }))
      .rejects.toThrow('既に登録されています');
  });

  it('MAX_FEEDS 超過でエラー', async () => {
    for (let i = 0; i < 50; i++) {
      await saveFeed({ url: `https://example.com/feed-${i}.xml`, title: `Feed ${i}` });
    }
    await expect(saveFeed({ url: 'https://example.com/feed-51.xml', title: 'Over limit' }))
      .rejects.toThrow('上限');
  });
});

describe('getFeed / listFeeds', () => {
  it('保存したフィードを取得できる', async () => {
    const saved = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    const retrieved = await getFeed(saved.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe('A');
  });

  it('全フィード一覧を取得できる', async () => {
    await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeed({ url: 'https://b.com/feed', title: 'B' });
    const feeds = await listFeeds();
    expect(feeds).toHaveLength(2);
  });
});

describe('deleteFeed', () => {
  it('フィードと関連アイテムを削除できる', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
    ]);

    const result = await deleteFeed(feed.id);
    expect(result).toBe(true);
    expect(await getFeed(feed.id)).toBeUndefined();
    expect(await listFeedItems(feed.id)).toHaveLength(0);
  });

  it('存在しないIDで false を返す', async () => {
    expect(await deleteFeed('non-existent')).toBe(false);
  });
});

describe('saveFeedItems', () => {
  it('新着アイテムを保存できる', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    const result = await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文1', publishedAt: 1000 },
      { guid: 'g2', title: 'Item 2', link: 'https://a.com/2', content: '本文2', publishedAt: 2000 },
    ]);
    expect(result.newCount).toBe(2);

    const items = await listFeedItems(feed.id);
    expect(items).toHaveLength(2);
  });

  it('重複 guid はスキップされる', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文1', publishedAt: 1000 },
    ]);

    const result = await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1 dup', link: 'https://a.com/1', content: '本文1', publishedAt: 1000 },
      { guid: 'g2', title: 'Item 2', link: 'https://a.com/2', content: '本文2', publishedAt: 2000 },
    ]);
    expect(result.newCount).toBe(1);

    const items = await listFeedItems(feed.id);
    expect(items).toHaveLength(2);
  });

  it('MAX_ITEMS_PER_FEED 超過で古いアイテムが削除される', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });

    // 100 件保存
    const items = Array.from({ length: 100 }, (_, i) => ({
      guid: `g${i}`,
      title: `Item ${i}`,
      link: `https://a.com/${i}`,
      content: `本文${i}`,
      publishedAt: i * 1000,
    }));
    await saveFeedItems(feed.id, items);

    // さらに 5 件追加
    const newItems = Array.from({ length: 5 }, (_, i) => ({
      guid: `new-g${i}`,
      title: `New Item ${i}`,
      link: `https://a.com/new-${i}`,
      content: `新着本文${i}`,
      publishedAt: 200000 + i * 1000,
    }));
    await saveFeedItems(feed.id, newItems);

    const allItems = await listFeedItems(feed.id);
    expect(allItems).toHaveLength(100);
  });

  it('フィードの itemCount と lastFetchedAt が更新される', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文1', publishedAt: 1000 },
    ]);
    const updated = await getFeed(feed.id);
    expect(updated!.itemCount).toBe(1);
    expect(updated!.lastFetchedAt).toBeGreaterThan(0);
  });
});

describe('listFeedItems', () => {
  it('publishedAt 降順で返す', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Old', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      { guid: 'g2', title: 'New', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
    ]);
    const items = await listFeedItems(feed.id);
    expect(items[0].title).toBe('New');
    expect(items[1].title).toBe('Old');
  });

  it('unreadOnly フィルタが動作する', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      { guid: 'g2', title: 'Item 2', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
    ]);

    const items = await listFeedItems(feed.id);
    await markItemRead(items[0].id);

    const unread = await listFeedItems(feed.id, { unreadOnly: true });
    expect(unread).toHaveLength(1);
    expect(unread[0].title).toBe('Item 1');
  });

  it('limit で件数制限できる', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, Array.from({ length: 10 }, (_, i) => ({
      guid: `g${i}`, title: `Item ${i}`, link: `https://a.com/${i}`, content: '本文', publishedAt: i * 1000,
    })));

    const limited = await listFeedItems(feed.id, { limit: 5 });
    expect(limited).toHaveLength(5);
  });
});

describe('markItemRead', () => {
  it('アイテムを既読にできる', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
    ]);
    const items = await listFeedItems(feed.id);
    expect(items[0].isRead).toBe(false);

    await markItemRead(items[0].id);
    const updated = await listFeedItems(feed.id);
    expect(updated[0].isRead).toBe(true);
  });
});

describe('listUnclassifiedItems', () => {
  it('未読 + 未分類のアイテムのみ返す', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      { guid: 'g2', title: 'Item 2', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
      { guid: 'g3', title: 'Item 3', link: 'https://a.com/3', content: '本文', publishedAt: 3000 },
    ]);

    // 1件を既読、1件を分類済みに
    const items = await listFeedItems(feed.id);
    await markItemRead(items[0].id); // Item 3 (最新)
    await updateItemTier(items[2].id, 'must-read'); // Item 1 (最古)

    const result = await listUnclassifiedItems();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Item 2');
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it('ページングが正しく動作する', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, Array.from({ length: 10 }, (_, i) => ({
      guid: `g${i}`, title: `Item ${i}`, link: `https://a.com/${i}`, content: '本文', publishedAt: i * 1000,
    })));

    const page1 = await listUnclassifiedItems(0, 3);
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBe(10);
    expect(page1.hasMore).toBe(true);

    const page2 = await listUnclassifiedItems(3, 3);
    expect(page2.items).toHaveLength(3);
    expect(page2.offset).toBe(3);
    expect(page2.hasMore).toBe(true);

    const lastPage = await listUnclassifiedItems(9, 3);
    expect(lastPage.items).toHaveLength(1);
    expect(lastPage.hasMore).toBe(false);
  });

  it('未分類アイテムなしで空配列を返す', async () => {
    const result = await listUnclassifiedItems();
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });
});

describe('listClassifiedItems', () => {
  it('分類済み未読の must-read + recommended のみ返す（skip 除外）', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Must Read', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      { guid: 'g2', title: 'Recommended', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
      { guid: 'g3', title: 'Skip', link: 'https://a.com/3', content: '本文', publishedAt: 3000 },
      { guid: 'g4', title: 'Unclassified', link: 'https://a.com/4', content: '本文', publishedAt: 4000 },
    ]);

    const items = await listFeedItems(feed.id);
    await updateItemTier(items.find(i => i.title === 'Must Read')!.id, 'must-read');
    await updateItemTier(items.find(i => i.title === 'Recommended')!.id, 'recommended');
    await updateItemTier(items.find(i => i.title === 'Skip')!.id, 'skip');

    const classified = await listClassifiedItems();
    expect(classified).toHaveLength(2);
    expect(classified.map(i => i.title)).toContain('Must Read');
    expect(classified.map(i => i.title)).toContain('Recommended');
  });

  it('tier フィルタで must-read のみ取得できる', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Must Read', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      { guid: 'g2', title: 'Recommended', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
    ]);

    const items = await listFeedItems(feed.id);
    await updateItemTier(items[0].id, 'recommended');
    await updateItemTier(items[1].id, 'must-read');

    const mustReads = await listClassifiedItems('must-read');
    expect(mustReads).toHaveLength(1);
    expect(mustReads[0].title).toBe('Must Read');
  });

  it('既読の分類済みは返さない', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
    ]);

    const items = await listFeedItems(feed.id);
    await updateItemTier(items[0].id, 'must-read');
    await markItemRead(items[0].id);

    const classified = await listClassifiedItems();
    expect(classified).toHaveLength(0);
  });
});

describe('updateItemTier', () => {
  it('記事の分類を更新できる', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
    ]);

    const items = await listFeedItems(feed.id);
    await updateItemTier(items[0].id, 'must-read');

    const updated = await listFeedItems(feed.id);
    expect(updated[0].tier).toBe('must-read');
    expect(updated[0].classifiedAt).toBeGreaterThan(0);
  });

  it('成功時に true を返す', async () => {
    const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
    ]);

    const items = await listFeedItems(feed.id);
    const result = await updateItemTier(items[0].id, 'must-read');
    expect(result).toBe(true);
  });

  it('存在しない ID では false を返す', async () => {
    const result = await updateItemTier('non-existent', 'must-read');
    expect(result).toBe(false);
  });
});
