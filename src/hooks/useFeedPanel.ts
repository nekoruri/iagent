import { useState, useCallback, useEffect, useMemo } from 'react';
import { listClassifiedItems, listFeeds, markItemRead } from '../store/feedStore';
import type { FeedItem, Feed, FeedItemDisplayTier } from '../types';

export function useFeedPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [selectedTier, setSelectedTier] = useState<FeedItemDisplayTier | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const feedMap = useMemo(() => {
    const map = new Map<string, Feed>();
    for (const feed of feeds) {
      map.set(feed.id, feed);
    }
    return map;
  }, [feeds]);

  const unreadCount = items.length;

  const refresh = useCallback(async (tier?: FeedItemDisplayTier) => {
    setIsLoading(true);
    try {
      const [itemsData, feedsData] = await Promise.all([
        listClassifiedItems(tier),
        listFeeds(),
      ]);
      setItems(itemsData);
      setFeeds(feedsData);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        refresh(selectedTier);
      }
      return next;
    });
  }, [refresh, selectedTier]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const changeTier = useCallback((tier: FeedItemDisplayTier | undefined) => {
    setSelectedTier(tier);
    refresh(tier);
  }, [refresh]);

  const handleMarkRead = useCallback(async (id: string) => {
    await markItemRead(id);
    await refresh(selectedTier);
  }, [refresh, selectedTier]);

  // 初回マウント時にデータ読み込み
  useEffect(() => {
    Promise.all([listClassifiedItems(), listFeeds()]).then(([itemsData, feedsData]) => {
      setItems(itemsData);
      setFeeds(feedsData);
    });
  }, []);

  return { isOpen, items, feeds, feedMap, selectedTier, isLoading, unreadCount, toggle, close, changeTier, handleMarkRead, refresh };
}
