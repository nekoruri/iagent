import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');
const mockFetchViaProxy = vi.fn();
const mockParseFeed = vi.fn();
vi.mock('../core/corsProxy', () => ({
  fetchViaProxy: (...args: unknown[]) => mockFetchViaProxy(...args),
}));
vi.mock('../core/feedParser', () => ({
  parseFeed: (...args: unknown[]) => mockParseFeed(...args),
}));
vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html,
  },
}));

import { feedTool } from './feedTool';
import {
  saveFeed,
  listFeeds,
  deleteFeed,
  saveFeedItems,
  listFeedItems,
  getFeed,
} from '../store/feedStore';

beforeEach(() => {
  __resetStores();
  mockFetchViaProxy.mockReset();
  mockParseFeed.mockReset();
  mockParseFeed.mockReturnValue({ title: 'テストフィード', siteUrl: 'https://example.com', items: [] });
});

describe('feedTool 定義', () => {
  it('ツール名が設定されている', () => {
    expect(feedTool.name).toBe('feed');
  });
});

describe('feedTool invoke', () => {
  it('多バイト文字で 2MB を超えるフィードをバイト数ベースで拒否する', async () => {
    const oversized = 'あ'.repeat(Math.ceil((2 * 1024 * 1024) / 3) + 1);
    mockFetchViaProxy.mockResolvedValue({
      text: vi.fn().mockResolvedValue(oversized),
    });

    const result = await feedTool.invoke({}, JSON.stringify({
      action: 'subscribe',
      url: 'https://example.com/rss.xml',
      feed_id: '',
      unread_only: '',
      limit: '',
    }));
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain('フィードサイズが上限');
    expect(mockParseFeed).not.toHaveBeenCalled();
  });
});

describe('feedStore 統合テスト', () => {
  it('フィードを登録・取得できる', async () => {
    const feed = await saveFeed({
      url: 'https://example.com/rss.xml',
      title: 'テストフィード',
      siteUrl: 'https://example.com',
    });
    expect(feed.id).toBeDefined();
    expect(feed.title).toBe('テストフィード');

    const retrieved = await getFeed(feed.id);
    expect(retrieved!.url).toBe('https://example.com/rss.xml');
  });

  it('フィード一覧を取得できる', async () => {
    await saveFeed({ url: 'https://a.com/rss', title: 'A' });
    await saveFeed({ url: 'https://b.com/rss', title: 'B' });
    const feeds = await listFeeds();
    expect(feeds).toHaveLength(2);
  });

  it('フィードを削除すると関連アイテムも削除される', async () => {
    const feed = await saveFeed({ url: 'https://a.com/rss', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      { guid: 'g2', title: 'Item 2', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
    ]);

    await deleteFeed(feed.id);
    expect(await getFeed(feed.id)).toBeUndefined();
    expect(await listFeedItems(feed.id)).toHaveLength(0);
  });

  it('アイテムの重複登録がスキップされる', async () => {
    const feed = await saveFeed({ url: 'https://a.com/rss', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
    ]);
    const result = await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      { guid: 'g2', title: 'Item 2', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
    ]);
    expect(result.newCount).toBe(1);
    expect(await listFeedItems(feed.id)).toHaveLength(2);
  });

  it('未読フィルタが動作する', async () => {
    const feed = await saveFeed({ url: 'https://a.com/rss', title: 'A' });
    await saveFeedItems(feed.id, [
      { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      { guid: 'g2', title: 'Item 2', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
    ]);
    const unread = await listFeedItems(feed.id, { unreadOnly: true });
    expect(unread).toHaveLength(2);
  });
});
