import { getDB } from './db';
import type { Feed, FeedItem, FeedItemTier, FeedItemDisplayTier } from '../types';

const FEEDS_STORE = 'feeds';
const ITEMS_STORE = 'feed-items';
const MAX_FEEDS = 50;
const MAX_ITEMS_PER_FEED = 100;

// --- Feed CRUD ---

export async function saveFeed(params: {
  url: string;
  title: string;
  siteUrl?: string;
}): Promise<Feed> {
  const db = await getDB();

  // 件数上限チェック
  const all = await db.getAll(FEEDS_STORE);
  if (all.length >= MAX_FEEDS) {
    throw new Error(`フィード登録数の上限（${MAX_FEEDS}件）に達しています`);
  }

  // URL 重複チェック
  const existing = (all as Feed[]).find((f) => f.url === params.url);
  if (existing) {
    throw new Error('このフィードは既に登録されています');
  }

  const feed: Feed = {
    id: crypto.randomUUID(),
    url: params.url,
    title: params.title,
    siteUrl: params.siteUrl,
    lastFetchedAt: 0,
    itemCount: 0,
    createdAt: Date.now(),
  };

  await db.put(FEEDS_STORE, feed);
  return feed;
}

export async function getFeed(id: string): Promise<Feed | undefined> {
  const db = await getDB();
  return db.get(FEEDS_STORE, id) as Promise<Feed | undefined>;
}

export async function listFeeds(): Promise<Feed[]> {
  const db = await getDB();
  const all: Feed[] = await db.getAll(FEEDS_STORE);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateFeed(id: string, patch: Partial<Feed>): Promise<void> {
  const db = await getDB();
  const existing = await db.get(FEEDS_STORE, id) as Feed | undefined;
  if (!existing) throw new Error('フィードが見つかりません');
  await db.put(FEEDS_STORE, { ...existing, ...patch, id });
}

export async function deleteFeed(id: string): Promise<boolean> {
  const db = await getDB();
  const existing = await db.get(FEEDS_STORE, id);
  if (!existing) return false;

  // 関連する feed-items も削除
  const items: FeedItem[] = await db.getAllFromIndex(ITEMS_STORE, 'feedId', id);
  for (const item of items) {
    await db.delete(ITEMS_STORE, item.id);
  }

  await db.delete(FEEDS_STORE, id);
  return true;
}

// --- FeedItem CRUD ---

export async function saveFeedItems(feedId: string, items: Array<{
  guid: string;
  title: string;
  link: string;
  content: string;
  publishedAt: number;
}>): Promise<{ newCount: number }> {
  const db = await getDB();

  // 既存の guid を取得して重複検出
  const existingItems: FeedItem[] = await db.getAllFromIndex(ITEMS_STORE, 'feedId', feedId);
  const existingGuids = new Set(existingItems.map((i) => i.guid));

  const newItems = items.filter((item) => !existingGuids.has(item.guid));

  const now = Date.now();
  for (const item of newItems) {
    const feedItem: FeedItem = {
      id: crypto.randomUUID(),
      feedId,
      guid: item.guid,
      title: item.title,
      link: item.link,
      content: item.content,
      publishedAt: item.publishedAt,
      isRead: false,
      createdAt: now,
    };
    await db.put(ITEMS_STORE, feedItem);
  }

  // 上限超過分を削除（古い順）
  const allItems: FeedItem[] = await db.getAllFromIndex(ITEMS_STORE, 'feedId', feedId);
  if (allItems.length > MAX_ITEMS_PER_FEED) {
    const sorted = [...allItems].sort((a, b) => a.publishedAt - b.publishedAt);
    const toDelete = sorted.slice(0, allItems.length - MAX_ITEMS_PER_FEED);
    for (const item of toDelete) {
      await db.delete(ITEMS_STORE, item.id);
    }
  }

  // フィードの itemCount を更新
  const finalItems: FeedItem[] = await db.getAllFromIndex(ITEMS_STORE, 'feedId', feedId);
  await updateFeed(feedId, { itemCount: finalItems.length, lastFetchedAt: now });

  return { newCount: newItems.length };
}

export async function listFeedItems(feedId: string, options?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<FeedItem[]> {
  const db = await getDB();
  let items: FeedItem[] = await db.getAllFromIndex(ITEMS_STORE, 'feedId', feedId);

  if (options?.unreadOnly) {
    items = items.filter((i) => !i.isRead);
  }

  items.sort((a, b) => b.publishedAt - a.publishedAt);

  if (options?.limit && options.limit > 0) {
    return items.slice(0, options.limit);
  }
  return items;
}

export async function markItemRead(id: string): Promise<void> {
  const db = await getDB();
  const item = await db.get(ITEMS_STORE, id) as FeedItem | undefined;
  if (!item) return;
  await db.put(ITEMS_STORE, { ...item, isRead: true });
}

// --- 分類関連 ---

// TODO: データ量増加時は publishedAt インデックスの cursor で走査し全件ロードを回避する
/** 未読 + 未分類の記事を取得（ページング付き） */
export async function listUnclassifiedItems(offset = 0, limit = 30): Promise<{
  items: FeedItem[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}> {
  const db = await getDB();
  const allItems: FeedItem[] = await db.getAll(ITEMS_STORE);
  const unclassified = allItems
    .filter((i) => !i.isRead && !i.tier)
    .sort((a, b) => b.publishedAt - a.publishedAt);
  const total = unclassified.length;
  const items = unclassified.slice(offset, offset + limit);
  return { items, total, offset, limit, hasMore: offset + limit < total };
}

// TODO: データ量増加時は publishedAt インデックスの cursor で走査し全件ロードを回避する
/** 分類済み未読記事を取得（must-read / recommended のみ、skip 除外） */
export async function listClassifiedItems(tier?: FeedItemDisplayTier): Promise<FeedItem[]> {
  const db = await getDB();
  const allItems: FeedItem[] = await db.getAll(ITEMS_STORE);
  return allItems
    .filter((i) => !i.isRead && i.tier && i.tier !== 'skip' && (!tier || i.tier === tier))
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

/** キーワードスコアリングで関連フィード記事を検索する（tier 考慮） */
export async function getRelevantFeedItems(query: string, limit: number = 5): Promise<FeedItem[]> {
  if (!query.trim()) return [];

  const db = await getDB();
  const allItems: FeedItem[] = await db.getAll(ITEMS_STORE);
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [];

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // 分類済み未読（skip 除外）を対象
  const candidates = allItems.filter((i) => !i.isRead && i.tier && i.tier !== 'skip');

  const scored = candidates.map((item) => {
    let keywordScore = 0;
    const lowerTitle = item.title.toLowerCase();
    const lowerContent = item.content.toLowerCase();

    for (const token of tokens) {
      if (lowerTitle.includes(token)) keywordScore += 5;
      if (lowerContent.includes(token)) keywordScore += 2;
    }

    // キーワードマッチがない場合はスコア0
    if (keywordScore === 0) return { item, score: 0 };

    let score = keywordScore;

    // tier ボーナス
    if (item.tier === 'must-read') score += 3;
    else if (item.tier === 'recommended') score += 1;

    // 新しさボーナス（7日以内: +2、30日以内: +1）
    const ageDays = (now - item.publishedAt) / DAY_MS;
    if (ageDays <= 7) score += 2;
    else if (ageDays <= 30) score += 1;

    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

/** 記事の分類を更新。成功時 true、対象が存在しない場合 false を返す */
export async function updateItemTier(id: string, tier: FeedItemTier): Promise<boolean> {
  const db = await getDB();
  const item = await db.get(ITEMS_STORE, id) as FeedItem | undefined;
  if (!item) return false;
  await db.put(ITEMS_STORE, { ...item, tier, classifiedAt: Date.now() });
  return true;
}
