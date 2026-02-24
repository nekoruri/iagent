import { useState, useCallback, useEffect } from 'react';
import { loadHeartbeatState } from '../store/heartbeatStore';
import type { HeartbeatResult } from '../types';

const LAST_READ_KEY = 'iagent-heartbeat-last-read';

export function useHeartbeatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<HeartbeatResult[]>([]);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(
    () => Number(localStorage.getItem(LAST_READ_KEY)) || 0,
  );

  const unreadCount = results.filter((r) => r.timestamp > lastReadTimestamp).length;

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

  // 初回マウント時にデータ読み込み（非同期の外部ストア同期）
  useEffect(() => {
    loadHeartbeatState().then((state) => {
      setResults(state.recentResults);
    });
  }, []);

  return { isOpen, results, unreadCount, toggle, close, markAsRead, refresh };
}
