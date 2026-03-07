import { useState, useCallback, useEffect, useMemo } from 'react';
import { loadHeartbeatState, togglePinHeartbeatResult, setHeartbeatFeedback, filterVisibleResults } from '../store/heartbeatStore';
import { buildUserFacingAutonomyExplanation, loadAutonomyFlowsByIds, type AutonomyFlowSummary } from '../core/autonomyDiagnostics';
import type { HeartbeatResult, FeedbackType } from '../types';

const LAST_READ_KEY = 'iagent-heartbeat-last-read';

export function useHeartbeatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<HeartbeatResult[]>([]);
  const [flowMap, setFlowMap] = useState<Record<string, AutonomyFlowSummary>>({});
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(
    () => Number(localStorage.getItem(LAST_READ_KEY)) || 0,
  );

  // snooze 期限経過で表示を更新するため 1 分ごとに now を更新
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const visibleResults = useMemo(() => (
    filterVisibleResults(results, now).map((result) => {
      const flow = result.flowId ? flowMap[result.flowId] : undefined;
      if (!flow) return result;
      const explanation = buildUserFacingAutonomyExplanation(flow);
      return {
        ...result,
        explanationWhyNow: explanation.whyNow,
        explanationOutcome: explanation.outcome,
      };
    })
  ), [results, now, flowMap]);
  const unreadCount = visibleResults.filter((r) => r.timestamp > lastReadTimestamp).length;

  const refresh = useCallback(async () => {
    const state = await loadHeartbeatState();
    setResults(state.recentResults);
    const flowIds = state.recentResults
      .map((result) => result.flowId)
      .filter((flowId): flowId is string => typeof flowId === 'string');
    if (flowIds.length === 0) {
      setFlowMap({});
      return;
    }
    const flows = await loadAutonomyFlowsByIds(flowIds);
    setFlowMap(flows);
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

  const open = useCallback(() => {
    setIsOpen(true);
    markAsRead();
  }, [markAsRead]);

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
    const refreshId = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(refreshId);
  }, [refresh]);

  return { isOpen, results: visibleResults, unreadCount, toggle, open, close, markAsRead, refresh, togglePin, sendFeedback };
}
