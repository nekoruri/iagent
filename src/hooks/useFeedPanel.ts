import { useState, useCallback, useRef, useMemo } from 'react';
import { listClassifiedItems, listFeeds, markItemRead } from '../store/feedStore';
import { loadHeartbeatState } from '../store/heartbeatStore';
import { buildUserFacingAutonomyExplanation, loadAutonomyFlowsByIds } from '../core/autonomyDiagnostics';
import type { FeedItem, Feed, FeedItemDisplayTier } from '../types';

const FEED_EXPLANATION_TASK_LABELS: Record<string, string> = {
  'feed-check': 'フィードの新着を確認した結果',
  'rss-digest-daily': 'RSS ダイジェストの対象として抽出した結果',
};

export function useFeedPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [selectedTier, setSelectedTier] = useState<FeedItemDisplayTier | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [explanation, setExplanation] = useState<{
    title: string;
    whyNow: string;
    outcome?: string;
  } | null>(null);
  const refreshIdRef = useRef(0);

  const feedMap = useMemo(() => {
    const map = new Map<string, Feed>();
    for (const feed of feeds) {
      map.set(feed.id, feed);
    }
    return map;
  }, [feeds]);

  // バッジは常に全 tier の未読数を表示
  const unreadCount = totalUnread;

  const refresh = useCallback(async (tier?: FeedItemDisplayTier) => {
    const id = ++refreshIdRef.current;
    setIsLoading(true);
    try {
      const fetches: [Promise<FeedItem[]>, Promise<Feed[]>, Promise<FeedItem[]>?] = [
        listClassifiedItems(tier),
        listFeeds(),
      ];
      // tier フィルタ中は全件数も別途取得
      if (tier) {
        fetches.push(listClassifiedItems());
      }
      const [itemsData, feedsData, allItems] = await Promise.all(fetches);
      // レース防止: 古い応答は無視
      if (id !== refreshIdRef.current) return;
      setItems(itemsData);
      setFeeds(feedsData);
      setTotalUnread(allItems ? allItems.length : itemsData.length);

      const heartbeatState = await loadHeartbeatState();
      const latestFeedResult = heartbeatState.recentResults.find((result) =>
        result.flowId && Object.prototype.hasOwnProperty.call(FEED_EXPLANATION_TASK_LABELS, result.taskId),
      );
      if (!latestFeedResult?.flowId) {
        setExplanation(null);
        return;
      }

      const flowMap = await loadAutonomyFlowsByIds([latestFeedResult.flowId]);
      if (id !== refreshIdRef.current) return;
      const flow = flowMap[latestFeedResult.flowId];
      if (!flow) {
        setExplanation(null);
        return;
      }

      const userFacing = buildUserFacingAutonomyExplanation(flow);
      setExplanation({
        title: FEED_EXPLANATION_TASK_LABELS[latestFeedResult.taskId] ?? 'フィードを確認した結果',
        whyNow: userFacing.whyNow,
        outcome: userFacing.outcome,
      });
    } finally {
      if (id === refreshIdRef.current) {
        setIsLoading(false);
      }
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

  return { isOpen, items, feeds, feedMap, selectedTier, isLoading, unreadCount, explanation, toggle, close, changeTier, handleMarkRead, refresh };
}
