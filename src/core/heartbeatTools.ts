import { getDB } from '../store/db';
import type { CalendarEvent, Feed, FeedItem, Monitor } from '../types';
import { loadConfigFromIDB } from '../store/configStore';
import { parseFeed } from './feedParser';
import { fetchViaProxy } from './corsProxy';

/** OpenAI function calling 形式のツールスキーマ */
export const WORKER_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'listCalendarEvents',
      description: 'カレンダーのイベント一覧を取得します。日付を指定すると、その日のイベントのみ返します。',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '日付（YYYY-MM-DD 形式）。省略すると全イベントを返します。',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getCurrentTime',
      description: '現在の日時を日本語形式で返します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetchFeeds',
      description: '購読中の全 RSS フィードの新着記事を取得します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listFeeds',
      description: '購読中のフィード一覧を取得します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'checkMonitors',
      description: '監視中の全 Web ページの変更をチェックします。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

/** Worker 内でツールを実行する */
export async function executeWorkerTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'listCalendarEvents': {
      const db = await getDB();
      const date = args.date as string | undefined;
      let events: CalendarEvent[];
      if (date) {
        events = await db.getAllFromIndex('calendar', 'date', date);
      } else {
        events = (await db.getAll('calendar')) as CalendarEvent[];
      }
      if (events.length === 0) {
        return JSON.stringify({ events: [], message: 'イベントはありません。' });
      }
      return JSON.stringify({
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          time: e.time,
          description: e.description,
        })),
      });
    }
    case 'getCurrentTime': {
      return JSON.stringify({
        currentTime: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      });
    }
    case 'listFeeds': {
      const db = await getDB();
      const feeds: Feed[] = await db.getAll('feeds');
      return JSON.stringify({
        feeds: feeds.map((f) => ({
          id: f.id,
          title: f.title,
          url: f.url,
          itemCount: f.itemCount,
          lastFetchedAt: f.lastFetchedAt,
        })),
        count: feeds.length,
      });
    }
    case 'fetchFeeds': {
      const db = await getDB();
      const feeds: Feed[] = await db.getAll('feeds');
      if (feeds.length === 0) {
        return JSON.stringify({ message: '購読中のフィードはありません。', results: [] });
      }

      const config = await loadConfigFromIDB();
      const proxyConfig = config?.proxy;

      const results = [];
      for (const feed of feeds) {
        try {
          const response = await fetchViaProxy(feed.url, proxyConfig ?? undefined);
          const text = await response.text();
          const parsed = parseFeed(text);

          // 既存 guid を取得
          const existingItems: FeedItem[] = await db.getAllFromIndex('feed-items', 'feedId', feed.id);
          const existingGuids = new Set(existingItems.map((i) => i.guid));
          const newItems = parsed.items.filter((item) => !existingGuids.has(item.guid));

          // 新着を保存
          const now = Date.now();
          for (const item of newItems) {
            await db.put('feed-items', {
              id: crypto.randomUUID(),
              feedId: feed.id,
              guid: item.guid,
              title: item.title,
              link: item.link,
              content: item.content,
              publishedAt: item.publishedAt,
              isRead: false,
              createdAt: now,
            });
          }

          // feed の lastFetchedAt 更新
          await db.put('feeds', { ...feed, lastFetchedAt: now, itemCount: existingItems.length + newItems.length });

          results.push({
            feedId: feed.id,
            title: feed.title,
            newCount: newItems.length,
            newItems: newItems.slice(0, 5).map((i) => ({ title: i.title, link: i.link })),
          });
        } catch (e) {
          results.push({
            feedId: feed.id,
            title: feed.title,
            newCount: 0,
            error: e instanceof Error ? e.message : '取得失敗',
          });
        }
      }

      return JSON.stringify({ results, totalFeeds: feeds.length });
    }
    case 'checkMonitors': {
      const db = await getDB();
      const monitors: Monitor[] = await db.getAll('monitors');
      if (monitors.length === 0) {
        return JSON.stringify({ message: '監視対象はありません。', results: [] });
      }

      const config = await loadConfigFromIDB();
      const proxyConfig = config?.proxy;

      const results = [];
      for (const monitor of monitors) {
        try {
          const response = await fetchViaProxy(monitor.url, proxyConfig ?? undefined);
          const html = await response.text();

          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          let text: string;
          if (monitor.selector) {
            const el = doc.querySelector(monitor.selector);
            text = el?.textContent?.trim() ?? '';
          } else {
            text = doc.body?.textContent?.trim() ?? '';
          }
          text = text.slice(0, 10240); // 10KB

          // SHA-256 ハッシュ計算
          const encoder = new TextEncoder();
          const data = encoder.encode(text);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

          const hasChanged = hash !== monitor.lastHash;
          const now = Date.now();

          await db.put('monitors', {
            ...monitor,
            lastHash: hash,
            lastText: text,
            lastCheckedAt: now,
            ...(hasChanged ? { changeDetectedAt: now } : {}),
          });

          results.push({
            monitorId: monitor.id,
            name: monitor.name,
            hasChanged,
            summary: hasChanged ? `「${monitor.name}」のコンテンツが変化しました。` : undefined,
          });
        } catch (e) {
          results.push({
            monitorId: monitor.id,
            name: monitor.name,
            hasChanged: false,
            error: e instanceof Error ? e.message : 'チェック失敗',
          });
        }
      }

      return JSON.stringify({ results, totalMonitors: monitors.length });
    }
    default:
      return JSON.stringify({ error: `不明なツール: ${name}` });
  }
}
