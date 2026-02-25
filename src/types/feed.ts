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
}
