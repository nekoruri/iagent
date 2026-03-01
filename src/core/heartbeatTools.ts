import { getDB } from '../store/db';
import type { CalendarEvent, Feed, FeedItem, FeedItemTier, FeedItemDisplayTier, Monitor } from '../types';
import { loadConfigFromIDB } from '../store/configStore';
import { parseFeed } from './feedParser';
import { fetchViaProxy } from './corsProxy';
import { saveMemory, getRecentMemoriesForReflection, cleanupLowScoredMemories, getRelevantMemories } from '../store/memoryStore';
import { getHeartbeatFeedbackSummary } from '../store/heartbeatStore';
import { listUnclassifiedItems, listClassifiedItems, updateItemTier } from '../store/feedStore';
import { DOMParser as LinkedomDOMParser } from 'linkedom';

const MAX_ITEMS_PER_FEED = 100;

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
  {
    type: 'function' as const,
    function: {
      name: 'getRecentMemoriesForReflection',
      description: '直近24時間の記憶と、よく参照される記憶を取得します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'saveReflection',
      description: 'ふりかえりの結果を reflection カテゴリの長期記憶として保存します。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'ふりかえりの内容' },
          tags: { type: 'string', description: 'タグ（カンマ区切り）' },
          importance: { type: 'number', description: '重要度（1-5）' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cleanupMemories',
      description: '低スコアの記憶をアーカイブに移動します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listUnreadFeedItems',
      description: '未読・未分類のフィード記事を title + excerpt で取得します（ページング対応）。',
      parameters: {
        type: 'object',
        properties: {
          offset: { type: 'number', description: '取得開始位置（デフォルト 0）' },
          limit: { type: 'number', description: '取得件数（デフォルト 30）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'saveFeedClassification',
      description: 'フィード記事の分類結果を保存します。',
      parameters: {
        type: 'object',
        properties: {
          classifications: {
            type: 'array',
            description: '分類結果の配列',
            items: {
              type: 'object',
              properties: {
                itemId: { type: 'string', description: '記事 ID' },
                tier: { type: 'string', enum: ['must-read', 'recommended', 'skip'], description: '分類' },
              },
              required: ['itemId', 'tier'],
            },
          },
        },
        required: ['classifications'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listClassifiedFeedItems',
      description: '分類済み未読記事を取得します（must-read + recommended のみ、briefing 用）。tier=all で両方取得。',
      parameters: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['must-read', 'recommended', 'all'], description: '分類でフィルタ。all で must-read + recommended の両方を取得（デフォルト: all）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getHeartbeatFeedbackSummary',
      description: '指定期間の Heartbeat 通知に対するユーザーフィードバック（Accept/Dismiss/Snooze）を集計します。タスク別の Accept 率を分析し、提案品質の改善に活用できます。',
      parameters: {
        type: 'object',
        properties: {
          periodHours: { type: 'number', description: '集計対象の期間（時間単位、デフォルト 24、1〜168）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'searchMemoriesByQuery',
      description: 'キーワードでユーザーの長期記憶を検索します。イベントタイトルや人名で検索すると、関連する記憶（議事メモ、予算情報等）を取得できます。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '検索キーワード（イベント名、人名、トピック等）' },
          limit: { type: 'number', description: '取得件数（デフォルト 5、最大 20）' },
        },
        required: ['query'],
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

          // 上限超過分を削除（古い順）
          const allItems: FeedItem[] = await db.getAllFromIndex('feed-items', 'feedId', feed.id);
          if (allItems.length > MAX_ITEMS_PER_FEED) {
            const sorted = [...allItems].sort((a, b) => a.publishedAt - b.publishedAt);
            const toDelete = sorted.slice(0, allItems.length - MAX_ITEMS_PER_FEED);
            for (const item of toDelete) {
              await db.delete('feed-items', item.id);
            }
          }

          // feed の lastFetchedAt 更新
          const finalCount = Math.min(existingItems.length + newItems.length, MAX_ITEMS_PER_FEED);
          await db.put('feeds', { ...feed, lastFetchedAt: now, itemCount: finalCount });

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

          // linkedom で HTML パース（Worker 環境でも CSS セレクタ対応）
          const parser = new LinkedomDOMParser();
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
    case 'getRecentMemoriesForReflection': {
      const { recent, topAccessed } = await getRecentMemoriesForReflection();
      return JSON.stringify({
        recent: recent.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          importance: m.importance,
          tags: m.tags,
          accessCount: m.accessCount,
          updatedAt: m.updatedAt,
        })),
        topAccessed: topAccessed.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          importance: m.importance,
          tags: m.tags,
          accessCount: m.accessCount,
          updatedAt: m.updatedAt,
        })),
        recentCount: recent.length,
        topAccessedCount: topAccessed.length,
      });
    }
    case 'saveReflection': {
      const content = args.content as string;
      if (!content) {
        return JSON.stringify({ error: 'content は必須です' });
      }
      const importance = typeof args.importance === 'number'
        ? Math.max(1, Math.min(5, args.importance))
        : 3;
      const tags = typeof args.tags === 'string'
        ? args.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
        : [];
      const memory = await saveMemory(content, 'reflection', { importance, tags });
      return JSON.stringify({ message: 'ふりかえりを保存しました', memory });
    }
    case 'cleanupMemories': {
      const archivedCount = await cleanupLowScoredMemories(5);
      return JSON.stringify({
        message: `${archivedCount} 件の記憶をアーカイブしました`,
        archivedCount,
      });
    }
    case 'listUnreadFeedItems': {
      const offset = Math.max(0, typeof args.offset === 'number' ? Math.floor(args.offset) : 0);
      const limit = Math.max(1, Math.min(100, typeof args.limit === 'number' ? Math.floor(args.limit) : 30));
      const result = await listUnclassifiedItems(offset, limit);
      const db = await getDB();
      const feeds: Feed[] = await db.getAll('feeds');
      const feedMap = new Map(feeds.map((f) => [f.id, f.title]));
      console.debug(`[Heartbeat] listUnreadFeedItems — ${result.items.length}/${result.total} 件取得 (offset=${offset}, hasMore=${result.hasMore})`);
      return JSON.stringify({
        items: result.items.map((item) => ({
          id: item.id,
          feedTitle: feedMap.get(item.feedId) ?? '',
          title: item.title,
          link: item.link,
          excerpt: item.content.replace(/<[^>]*>/g, '').slice(0, 100),
          publishedAt: item.publishedAt,
        })),
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        hasMore: result.hasMore,
      });
    }
    case 'saveFeedClassification': {
      const classifications = args.classifications as Array<{ itemId: string; tier: string }> | undefined;
      if (!Array.isArray(classifications)) {
        return JSON.stringify({ error: 'classifications は必須です' });
      }
      const validTiers = new Set(['must-read', 'recommended', 'skip']);
      let savedCount = 0;
      const tierCounts: Record<string, number> = {};
      for (const c of classifications) {
        if (c.itemId && validTiers.has(c.tier)) {
          const ok = await updateItemTier(c.itemId, c.tier as FeedItemTier);
          if (ok) {
            savedCount++;
            tierCounts[c.tier] = (tierCounts[c.tier] ?? 0) + 1;
          }
        }
      }
      console.debug(`[Heartbeat] saveFeedClassification — ${savedCount} 件保存:`, tierCounts);
      return JSON.stringify({ message: `${savedCount} 件の分類を保存しました`, savedCount });
    }
    case 'listClassifiedFeedItems': {
      const rawTier = args.tier as string | undefined;
      const tierFilter = rawTier && rawTier !== 'all' ? rawTier as FeedItemDisplayTier : undefined;
      const items = await listClassifiedItems(tierFilter);
      const db2 = await getDB();
      const feeds2: Feed[] = await db2.getAll('feeds');
      const feedMap2 = new Map(feeds2.map((f) => [f.id, f.title]));
      console.debug(`[Heartbeat] listClassifiedFeedItems — ${items.length} 件 (tier=${tierFilter ?? 'all'})`);
      return JSON.stringify({
        items: items.map((item) => ({
          id: item.id,
          feedTitle: feedMap2.get(item.feedId) ?? '',
          title: item.title,
          link: item.link,
          tier: item.tier,
          publishedAt: item.publishedAt,
        })),
        count: items.length,
      });
    }
    case 'getHeartbeatFeedbackSummary': {
      const periodHours = Math.max(1, Math.min(168, typeof args.periodHours === 'number' ? Math.floor(args.periodHours) : 24));
      const periodMs = periodHours * 60 * 60 * 1000;
      const summary = await getHeartbeatFeedbackSummary(periodMs);
      return JSON.stringify({
        periodHours,
        totalResults: summary.totalResults,
        totalWithFeedback: summary.totalWithFeedback,
        overallAcceptRate: Math.round(summary.overallAcceptRate * 100),
        taskStats: summary.taskStats.map((s) => ({
          taskId: s.taskId,
          accepted: s.accepted,
          dismissed: s.dismissed,
          snoozed: s.snoozed,
          total: s.total,
          acceptRate: Math.round(s.acceptRate * 100),
        })),
      });
    }
    case 'searchMemoriesByQuery': {
      const query = args.query as string | undefined;
      if (!query || !query.trim()) {
        return JSON.stringify({ error: 'query は必須です' });
      }
      const limit = Math.max(1, Math.min(20, typeof args.limit === 'number' ? Math.floor(args.limit) : 5));
      const memories = await getRelevantMemories(query, limit);
      return JSON.stringify({
        memories: memories.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          importance: m.importance,
          tags: m.tags,
          updatedAt: m.updatedAt,
        })),
        count: memories.length,
        query,
      });
    }
    default:
      return JSON.stringify({ error: `不明なツール: ${name}` });
  }
}
