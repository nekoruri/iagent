import { getDB } from '../store/db';
import type { CalendarEvent, Feed, FeedItem, FeedItemTier, FeedItemDisplayTier, Memory, Monitor } from '../types';
import { loadConfigFromIDB } from '../store/configStore';
import { parseFeed } from './feedParser';
import { fetchViaProxy } from './corsProxy';
import { saveMemory, getRecentMemoriesForReflection, cleanupLowScoredMemories, getRelevantMemories, listMemories } from '../store/memoryStore';
import { listClips } from '../store/clipStore';
import { getHeartbeatFeedbackSummary } from '../store/heartbeatStore';
import { listUnclassifiedItems, listClassifiedItems, updateItemTier } from '../store/feedStore';
import { DOMParser as LinkedomDOMParser } from 'linkedom';
import { parseDeadline, daysUntilDeadline } from './deadlineParser';

const MAX_ITEMS_PER_FEED = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

// --- 月次 goal 統計 (F15) ---

export type GoalStatus = 'active' | 'stale' | 'new' | 'overdue';

export interface GoalStat {
  id: string;
  content: string;
  importance: number;
  status: GoalStatus;
  daysSinceCreation: number;
  daysSinceUpdate: number;
  deadline?: { original: string; daysUntil: number };
}

export interface MonthlyGoalStats {
  totalGoals: number;
  activeGoals: number;
  staleGoals: number;
  overdueGoals: number;
  goalsWithDeadline: number;
  newGoalsThisMonth: number;
  goals: GoalStat[];
}

/**
 * goal メモリの月次統計を計算する（純粋関数 — テスト用に公開）
 * @param goals goal カテゴリのメモリ配列
 * @param now 基準日時
 */
export function computeMonthlyGoalStats(goals: Memory[], now: Date): MonthlyGoalStats {
  const nowMs = now.getTime();
  const STALE_DAYS = 7;
  const NEW_DAYS = 30;

  let activeCount = 0;
  let staleCount = 0;
  let overdueCount = 0;
  let deadlineCount = 0;
  let newCount = 0;

  const goalStats: GoalStat[] = goals.map((m) => {
    const daysSinceCreation = Math.floor((nowMs - m.createdAt) / DAY_MS);
    const daysSinceUpdate = Math.floor((nowMs - m.updatedAt) / DAY_MS);

    // 期日の計算
    const dl = parseDeadline(m.content, now);
    let deadlineInfo: GoalStat['deadline'];
    let isOverdue = false;
    if (dl) {
      deadlineCount++;
      const days = daysUntilDeadline(dl.date, now);
      deadlineInfo = { original: dl.original, daysUntil: days };
      if (days < 0) isOverdue = true;
    }

    // ステータス判定（overdue > stale > new > active の優先順）
    let status: GoalStatus;
    if (isOverdue) {
      status = 'overdue';
      overdueCount++;
    } else if (daysSinceUpdate >= STALE_DAYS) {
      status = 'stale';
      staleCount++;
    } else if (daysSinceCreation < NEW_DAYS) {
      status = 'new';
      newCount++;
    } else {
      status = 'active';
      activeCount++;
    }

    return {
      id: m.id,
      content: m.content,
      importance: m.importance,
      status,
      daysSinceCreation,
      daysSinceUpdate,
      deadline: deadlineInfo,
    };
  });

  return {
    totalGoals: goals.length,
    activeGoals: activeCount,
    staleGoals: staleCount,
    overdueGoals: overdueCount,
    goalsWithDeadline: deadlineCount,
    newGoalsThisMonth: newCount,
    goals: goalStats,
  };
}

// --- ソース横断トピック統合ヘルパー ---

/** 統一アイテム形式 */
export interface UnifiedItem {
  id: string;
  source: 'feed' | 'clip';
  title: string;
  link: string;
  isRead: boolean;
  publishedAt: number;
  tier?: FeedItemTier;
  feedId?: string;
  feedTitle?: string;
}

/** トピックグループ */
export interface TopicGroup {
  topicTitle: string;
  sourceCount: number;
  anyUnread: boolean;
  latestAt: number;
  items: UnifiedItem[];
}

/** UTM パラメータ除去 + 末尾スラッシュ統一 + フラグメント除去 + ホスト小文字化 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];
    for (const p of removeParams) {
      u.searchParams.delete(p);
    }
    u.hash = '';
    // ホスト/スキームのみ小文字化（パス・クエリは case-sensitive なサーバーがあるため保持）
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    let normalized = u.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.toLowerCase();
  }
}

const STOP_WORDS_EN = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'it', 'its', 'be', 'has', 'have', 'had',
  'do', 'does', 'did', 'will', 'would', 'can', 'could', 'may', 'this', 'that',
  'not', 'but', 'and', 'or', 'if', 'so', 'no', 'all', 'how', 'new',
]);
const STOP_WORDS_JA = new Set([
  'の', 'に', 'は', 'を', 'が', 'で', 'と', 'も', 'な', 'た', 'し', 'て',
  'い', 'る', 'へ', 'から', 'まで', 'より', 'など', 'こと', 'もの', 'ため',
  'する', 'した', 'され', 'これ', 'それ', 'この', 'その', 'ある', 'いる',
]);

/** タイトルからキートークンを抽出（ストップワード除外） */
export function extractKeyTokens(title: string): Set<string> {
  // 記号・空白で分割
  const raw = title
    .toLowerCase()
    .split(/[\s\-_/|:;,!?()[\]{}""''「」『』【】〈〉（）・、。]+/)
    .filter((t) => t.length >= 2);

  const tokens = new Set<string>();
  for (const t of raw) {
    if (STOP_WORDS_EN.has(t) || STOP_WORDS_JA.has(t)) continue;
    tokens.add(t);
  }
  return tokens;
}

/** 2 つのトークン集合の共通要素数を返す */
export function countCommonTokens(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const t of a) {
    if (b.has(t)) count++;
  }
  return count;
}

/** Union-Find */
class UnionFind {
  private parent: number[];
  private rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(x: number, y: number): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    if (this.rank[rx] < this.rank[ry]) { this.parent[rx] = ry; }
    else if (this.rank[rx] > this.rank[ry]) { this.parent[ry] = rx; }
    else { this.parent[ry] = rx; this.rank[rx]++; }
  }
}

/** アイテムをトピックごとにグルーピング */
export function groupByTopic(items: UnifiedItem[]): TopicGroup[] {
  if (items.length === 0) return [];

  const uf = new UnionFind(items.length);

  // URL 正規化マップ
  const urlMap = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const norm = normalizeUrl(items[i].link);
    const list = urlMap.get(norm);
    if (list) { list.push(i); } else { urlMap.set(norm, [i]); }
  }

  // Phase 1: URL 完全一致でマージ
  for (const indices of urlMap.values()) {
    for (let j = 1; j < indices.length; j++) {
      uf.union(indices[0], indices[j]);
    }
  }

  // Phase 2: タイトルキーワード重複でマージ
  const tokenSets = items.map((item) => extractKeyTokens(item.title));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (uf.find(i) === uf.find(j)) continue;
      const common = countCommonTokens(tokenSets[i], tokenSets[j]);
      const minSize = Math.min(tokenSets[i].size, tokenSets[j].size);
      if (common >= 2 && minSize > 0 && common / minSize >= 0.4) {
        uf.union(i, j);
      }
    }
  }

  // グループ構築
  const groups = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = uf.find(i);
    const g = groups.get(root);
    if (g) { g.push(i); } else { groups.set(root, [i]); }
  }

  const result: TopicGroup[] = [];
  for (const indices of groups.values()) {
    const groupItems = indices.map((i) => items[i]);

    // sourceCount: feed は feedId で区別（一意キー）、clip = 1 ソース
    const sources = new Set<string>();
    for (const item of groupItems) {
      if (item.source === 'feed') {
        sources.add(`feed:${item.feedId ?? item.feedTitle ?? ''}`);
      } else {
        sources.add('clip');
      }
    }

    // 最長タイトルを代表に
    const topicTitle = groupItems.reduce((best, cur) =>
      cur.title.length > best.title.length ? cur : best
    ).title;

    result.push({
      topicTitle,
      sourceCount: sources.size,
      anyUnread: groupItems.some((item) => !item.isRead),
      latestAt: Math.max(...groupItems.map((item) => item.publishedAt)),
      items: groupItems,
    });
  }

  // ソート: sourceCount 降順 → latestAt 降順
  result.sort((a, b) => b.sourceCount - a.sourceCount || b.latestAt - a.latestAt);
  return result;
}

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
      description: '現在の日時を日本語形式で返します。曜日情報（dayOfWeek: 0=日〜6=土、dayOfWeekName: 日本語曜日名）も含みます。',
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
  {
    type: 'function' as const,
    function: {
      name: 'getInfoThresholdStatus',
      description: '未分類フィード・未読分類済み記事・クリップの件数と閾値を返します。閾値超過時に整理を提案するために使います。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getWeeklyReflections',
      description: '指定期間内の reflection カテゴリの記憶を取得します。週次サマリー生成に使います。',
      parameters: {
        type: 'object',
        properties: {
          periodDays: { type: 'number', description: '取得期間（日数、デフォルト 7、1〜30）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getCrossSourceTopics',
      description: 'RSS フィード記事とクリップを横断検索し、複数ソースで言及されている同一トピックを検出・グループ化します。',
      parameters: {
        type: 'object',
        properties: {
          periodDays: { type: 'number', description: '対象期間（日数、デフォルト 7、1〜30）' },
          query: { type: 'string', description: 'キーワードフィルタ（title/content/tags で絞り込み）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getMonthlyGoalStats',
      description: 'goal カテゴリの全メモリを集計し、月次レビュー用の統計（活動状態・期日状態・新規/停滞/期限超過の分類）を返します。',
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
      const now = new Date();
      const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
      // Intl.DateTimeFormat で環境非依存に Asia/Tokyo の曜日を取得
      const weekdayPart = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(now);
      const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const dayOfWeek = weekdayMap[weekdayPart] ?? now.getDay();
      return JSON.stringify({
        currentTime: now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
        dayOfWeek,
        dayOfWeekName: dayNames[dayOfWeek],
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
    case 'getInfoThresholdStatus': {
      const thresholds = { unclassifiedFeed: 50, unreadClassified: 30, clips: 100 };
      // feed-items は 1 回のフルスキャンで両方のカウントを算出（二重走査回避）
      const db3 = await getDB();
      const [allFeedItems, clips] = await Promise.all([
        db3.getAll('feed-items') as Promise<FeedItem[]>,
        listClips(),
      ]);
      let unclassifiedFeedCount = 0;
      let unreadClassifiedCount = 0;
      for (const item of allFeedItems) {
        if (!item.isRead && !item.tier) unclassifiedFeedCount++;
        else if (!item.isRead && item.tier && item.tier !== 'skip') unreadClassifiedCount++;
      }
      const totalClipCount = clips.length;
      const details = {
        unclassifiedFeedExceeded: unclassifiedFeedCount > thresholds.unclassifiedFeed,
        unreadClassifiedExceeded: unreadClassifiedCount > thresholds.unreadClassified,
        clipsExceeded: totalClipCount > thresholds.clips,
      };
      return JSON.stringify({
        unclassifiedFeedCount,
        unreadClassifiedCount,
        totalClipCount,
        thresholds,
        exceeded: details.unclassifiedFeedExceeded || details.unreadClassifiedExceeded || details.clipsExceeded,
        details,
      });
    }
    case 'getWeeklyReflections': {
      const DAY_MS = 24 * 60 * 60 * 1000;
      const periodDays = Math.max(1, Math.min(30, typeof args.periodDays === 'number' ? Math.floor(args.periodDays) : 7));
      const cutoff = Date.now() - periodDays * DAY_MS;
      const allReflections = await listMemories('reflection');
      const filtered = allReflections
        .filter((m) => m.createdAt >= cutoff)
        .map((m) => ({
          id: m.id,
          content: m.content,
          importance: m.importance,
          tags: m.tags,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        }));
      return JSON.stringify({
        reflections: filtered,
        count: filtered.length,
        periodDays,
      });
    }
    case 'getCrossSourceTopics': {
      const DAY_MS = 24 * 60 * 60 * 1000;
      const periodDays = Math.max(1, Math.min(30, typeof args.periodDays === 'number' ? Math.floor(args.periodDays) : 7));
      const cutoff = Date.now() - periodDays * DAY_MS;
      const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';

      const db6 = await getDB();
      const [allFeedItems, allClips] = await Promise.all([
        db6.getAll('feed-items') as Promise<FeedItem[]>,
        listClips(),
      ]);

      // フィード名マップ
      const feeds6: Feed[] = await db6.getAll('feeds');
      const feedMap6 = new Map(feeds6.map((f) => [f.id, f.title]));

      // 統一形式に変換 + フィルタ
      const unified: UnifiedItem[] = [];

      for (const item of allFeedItems) {
        if (item.publishedAt < cutoff) continue;
        if (item.tier === 'skip') continue;
        if (query) {
          const haystack = `${item.title} ${item.content}`.toLowerCase();
          if (!haystack.includes(query)) continue;
        }
        unified.push({
          id: item.id,
          source: 'feed',
          title: item.title,
          link: item.link,
          isRead: item.isRead,
          publishedAt: item.publishedAt,
          tier: item.tier,
          feedId: item.feedId,
          feedTitle: feedMap6.get(item.feedId),
        });
      }

      for (const clip of allClips) {
        if (clip.createdAt < cutoff) continue;
        if (query) {
          const haystack = `${clip.title} ${clip.content} ${clip.tags.join(' ')}`.toLowerCase();
          if (!haystack.includes(query)) continue;
        }
        unified.push({
          id: clip.id,
          source: 'clip',
          title: clip.title,
          link: clip.url,
          isRead: true, // クリップは保存済み = 既読扱い
          publishedAt: clip.createdAt,
        });
      }

      const allGroups = groupByTopic(unified);
      // sourceCount >= 2 のみ、上限 20
      const topics = allGroups.filter((g) => g.sourceCount >= 2).slice(0, 20);

      return JSON.stringify({
        topics,
        totalTopics: topics.length,
        periodDays,
      });
    }
    case 'getMonthlyGoalStats': {
      const goals = await listMemories('goal');
      const stats = computeMonthlyGoalStats(goals, new Date());
      return JSON.stringify(stats);
    }
    default:
      return JSON.stringify({ error: `不明なツール: ${name}` });
  }
}
