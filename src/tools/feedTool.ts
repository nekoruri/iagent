import { tool } from '@openai/agents';
import { z } from 'zod';
import { saveFeed, listFeeds, deleteFeed, listFeedItems, saveFeedItems, getFeed } from '../store/feedStore';
import { parseFeed } from '../core/feedParser';
import { fetchViaProxy } from '../core/corsProxy';

const MIN_FETCH_INTERVAL_MS = 5 * 60 * 1000; // 5分
const MAX_FEED_SIZE = 2 * 1024 * 1024; // 2MB

export const feedTool = tool({
  name: 'feed',
  description: `RSSフィード（RSS 2.0 / Atom 1.0）を購読・取得します。
action:
- "subscribe": フィードを購読登録。url は必須。CORS プロキシ経由で取得します。
- "unsubscribe": 購読を解除。feed_id を指定。
- "list_feeds": 購読中のフィード一覧を取得。
- "fetch": 特定フィードの新着を取得。feed_id を指定。
- "fetch_all": 全フィードの新着を一括取得。
- "list_items": フィードの記事一覧を取得。feed_id を指定。unread_only で未読のみ。`,
  parameters: z.object({
    action: z.enum(['subscribe', 'unsubscribe', 'list_feeds', 'fetch', 'fetch_all', 'list_items']),
    url: z.string().describe('フィードURL。subscribe 時に必須、他は空文字'),
    feed_id: z.string().describe('フィードID。unsubscribe/fetch/list_items 時に必須、他は空文字'),
    unread_only: z.string().describe('未読のみ取得（"true"/"false"）。list_items 時に任意'),
    limit: z.string().describe('取得件数上限。list_items 時に任意'),
  }),
  execute: async ({ action, url, feed_id, unread_only, limit }) => {
    if (action === 'subscribe') {
      if (!url) return JSON.stringify({ error: 'url は必須です' });
      try {
        // フィードを取得してパース
        const response = await fetchViaProxy(url);
        const text = await response.text();
        if (text.length > MAX_FEED_SIZE) {
          return JSON.stringify({ error: `フィードサイズが上限（${MAX_FEED_SIZE / 1024 / 1024}MB）を超えています` });
        }
        const parsed = parseFeed(text);

        const feed = await saveFeed({
          url,
          title: parsed.title || url,
          siteUrl: parsed.siteUrl,
        });

        // 初回アイテム保存
        if (parsed.items.length > 0) {
          await saveFeedItems(feed.id, parsed.items);
        }

        return JSON.stringify({
          message: 'フィードを購読しました',
          feed: { id: feed.id, title: feed.title, url: feed.url, itemCount: parsed.items.length },
        });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : 'フィードの購読に失敗しました' });
      }
    }

    if (action === 'unsubscribe') {
      if (!feed_id) return JSON.stringify({ error: 'feed_id は必須です' });
      const deleted = await deleteFeed(feed_id);
      return JSON.stringify({ message: deleted ? '購読を解除しました' : 'フィードが見つかりません' });
    }

    if (action === 'list_feeds') {
      const feeds = await listFeeds();
      return JSON.stringify({
        feeds: feeds.map((f) => ({
          id: f.id, title: f.title, url: f.url, siteUrl: f.siteUrl,
          itemCount: f.itemCount, lastFetchedAt: f.lastFetchedAt,
        })),
        count: feeds.length,
      });
    }

    if (action === 'fetch') {
      if (!feed_id) return JSON.stringify({ error: 'feed_id は必須です' });
      try {
        return JSON.stringify(await fetchFeedById(feed_id));
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : 'フィードの取得に失敗しました' });
      }
    }

    if (action === 'fetch_all') {
      const feeds = await listFeeds();
      const results = [];
      for (const feed of feeds) {
        try {
          const result = await fetchFeedById(feed.id);
          results.push(result);
        } catch (e) {
          results.push({
            feedId: feed.id,
            title: feed.title,
            error: e instanceof Error ? e.message : '取得失敗',
            newCount: 0,
          });
        }
      }
      return JSON.stringify({ results, totalFeeds: feeds.length });
    }

    if (action === 'list_items') {
      if (!feed_id) return JSON.stringify({ error: 'feed_id は必須です' });
      const limitNum = limit ? parseInt(limit, 10) : undefined;
      const items = await listFeedItems(feed_id, {
        unreadOnly: unread_only === 'true',
        limit: limitNum,
      });
      return JSON.stringify({
        items: items.map((i) => ({
          id: i.id, title: i.title, link: i.link, publishedAt: i.publishedAt, isRead: i.isRead,
        })),
        count: items.length,
      });
    }

    return JSON.stringify({ error: '不明なアクションです' });
  },
});

/** 単一フィードの新着取得 */
async function fetchFeedById(feedId: string): Promise<{
  feedId: string;
  title: string;
  newCount: number;
}> {
  const feed = await getFeed(feedId);
  if (!feed) throw new Error('フィードが見つかりません');

  // 最小取得間隔チェック
  if (Date.now() - feed.lastFetchedAt < MIN_FETCH_INTERVAL_MS) {
    return { feedId: feed.id, title: feed.title, newCount: 0 };
  }

  const response = await fetchViaProxy(feed.url);
  const text = await response.text();
  if (text.length > MAX_FEED_SIZE) {
    throw new Error('フィードサイズが上限を超えています');
  }

  const parsed = parseFeed(text);
  const { newCount } = await saveFeedItems(feed.id, parsed.items);

  return { feedId: feed.id, title: feed.title, newCount };
}
