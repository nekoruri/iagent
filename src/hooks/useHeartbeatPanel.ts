import { useState, useCallback, useEffect, useMemo } from 'react';
import { loadHeartbeatState, togglePinHeartbeatResult, setHeartbeatFeedback, filterVisibleResults } from '../store/heartbeatStore';
import type { HeartbeatResult, FeedbackType } from '../types';

const LAST_READ_KEY = 'iagent-heartbeat-last-read';

export function useHeartbeatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<HeartbeatResult[]>([]);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(
    () => Number(localStorage.getItem(LAST_READ_KEY)) || 0,
  );

  const visibleResults = useMemo(() => filterVisibleResults(results), [results]);
  const unreadCount = visibleResults.filter((r) => r.timestamp > lastReadTimestamp).length;

  const refresh = useCallback(async () => {
    const state = await loadHeartbeatState();
    setResults(state.recentResults);
  }, []);

  const markAsRead = useCallback(() => {
    const now = Date.now();
    setLastReadTimestamp(now);
    localStorage.setItem(LAST_READ_KEY, String(now));
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) markAsRead();
      return next;
    });
  }, [markAsRead]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const togglePin = useCallback(async (taskId: string, timestamp: number) => {
    await togglePinHeartbeatResult(taskId, timestamp);
    await refresh();
  }, [refresh]);

  const sendFeedback = useCallback(async (taskId: string, timestamp: number, type: FeedbackType, snoozedUntil?: number) => {
    await setHeartbeatFeedback(taskId, timestamp, type, snoozedUntil);
    await refresh();
  }, [refresh]);

  // 初回マウント時にデータ読み込み（非同期の外部ストア同期）
  useEffect(() => {
    loadHeartbeatState().then((state) => {
      setResults(state.recentResults);
    });
  }, []);

  return { isOpen, results: visibleResults, unreadCount, toggle, close, markAsRead, refresh, togglePin, sendFeedback };
}
