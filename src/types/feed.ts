export type FeedItemTier = 'must-read' | 'recommended' | 'skip';
/** briefing で使う分類（skip 除外） */
export type FeedItemDisplayTier = Exclude<FeedItemTier, 'skip'>;

export interface Feed {
  id: string;
  url: string;
  title: string;
  siteUrl?: string;
  lastFetchedAt: number;
  lastETag?: string;
  lastModified?: string;
  itemCount: number;
  createdAt: number;
}

export interface FeedItem {
  id: string;
  feedId: string;
  guid: string;            // 重複検出用
  title: string;
  link: string;
  content: string;         // DOMPurify 済み
  publishedAt: number;
  isRead: boolean;
  createdAt: number;
  tier?: FeedItemTier;       // LLM 分類結果（未分類は undefined）
  classifiedAt?: number;     // 分類実行日時
}
