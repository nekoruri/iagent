import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHeartbeatPanel } from './useHeartbeatPanel';
import type { HeartbeatResult, FeedbackType } from '../types';

// --- ストアモック ---
const mockLoadHeartbeatState = vi.fn();
const mockTogglePin = vi.fn();
const mockSetFeedback = vi.fn();
const mockLoadAutonomyFlowsByIds = vi.fn();

vi.mock('../store/heartbeatStore', () => ({
  loadHeartbeatState: (...args: unknown[]) => mockLoadHeartbeatState(...args),
  togglePinHeartbeatResult: (...args: unknown[]) => mockTogglePin(...args),
  setHeartbeatFeedback: (...args: unknown[]) => mockSetFeedback(...args),
  filterVisibleResults: (results: HeartbeatResult[], now: number) =>
    results.filter((r) => {
      if (!r.feedback) return true;
      if (r.feedback.type === 'dismissed') return false;
      if (r.feedback.type === 'snoozed') {
        if (r.feedback.snoozedUntil == null) return true;
        return now >= r.feedback.snoozedUntil;
      }
      return true;
    }),
}));

vi.mock('../core/autonomyDiagnostics', () => ({
  loadAutonomyFlowsByIds: (...args: unknown[]) => mockLoadAutonomyFlowsByIds(...args),
  buildUserFacingAutonomyExplanation: () => ({
    whyNow: 'Push 通知に確認し、朝 / 予定が近い / 通常モードとして扱いました。',
    outcome: '通知から開きました。',
  }),
}));

// --- テストデータ ---
function makeResult(overrides?: Partial<HeartbeatResult>): HeartbeatResult {
  return {
    taskId: 'task-1',
    timestamp: 1000,
    hasChanges: true,
    summary: 'テスト結果',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockLoadHeartbeatState.mockResolvedValue({ recentResults: [] });
  mockLoadAutonomyFlowsByIds.mockResolvedValue({});
  mockTogglePin.mockResolvedValue(undefined);
  mockSetFeedback.mockResolvedValue(undefined);
});

async function renderHeartbeatPanelHook() {
  const rendered = renderHook(() => useHeartbeatPanel());
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await Promise.resolve();
  });
  return rendered;
}

describe('useHeartbeatPanel', () => {
  // --- 初期状態 ---
  it('初期状態は閉じた状態で空配列', async () => {
    const { result } = await renderHeartbeatPanelHook();

    await waitFor(() => {
      expect(mockLoadHeartbeatState).toHaveBeenCalled();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('初回マウント時にデータを読み込む', async () => {
    const results = [makeResult({ timestamp: 5000, flowId: 'flow-1' })];
    mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });
    mockLoadAutonomyFlowsByIds.mockResolvedValue({
      'flow-1': {
        flowId: 'flow-1',
        startedAt: 1000,
        endedAt: 5000,
        source: 'push',
        stages: ['decision', 'delivery', 'reaction'],
        eventCount: 3,
        taskIds: ['task-1'],
        channels: ['push'],
      },
    });

    const { result } = await renderHeartbeatPanelHook();

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
    });

    expect(result.current.results[0].summary).toBe('テスト結果');
    expect(result.current.results[0]).toEqual(expect.objectContaining({
      explanationWhyNow: 'Push 通知に確認し、朝 / 予定が近い / 通常モードとして扱いました。',
      explanationOutcome: '通知から開きました。',
    }));
  });

  // --- パネル開閉 ---
  describe('toggle / close', () => {
    it('toggle で開閉する', async () => {
      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(mockLoadHeartbeatState).toHaveBeenCalled());

      act(() => result.current.toggle());
      expect(result.current.isOpen).toBe(true);

      act(() => result.current.toggle());
      expect(result.current.isOpen).toBe(false);
    });

    it('close でパネルを閉じる', async () => {
      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(mockLoadHeartbeatState).toHaveBeenCalled());

      act(() => result.current.toggle()); // 開く
      act(() => result.current.close());
      expect(result.current.isOpen).toBe(false);
    });

    it('open でパネルを開いて既読化する', async () => {
      const results = [makeResult({ timestamp: 5000 })];
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.unreadCount).toBe(1));

      act(() => result.current.open());

      expect(result.current.isOpen).toBe(true);
      expect(result.current.unreadCount).toBe(0);
    });

    it('toggle で開くと markAsRead が呼ばれる', async () => {
      const results = [makeResult({ timestamp: 5000 })];
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.results).toHaveLength(1));

      expect(result.current.unreadCount).toBe(1);

      act(() => result.current.toggle()); // 開く → markAsRead
      expect(result.current.unreadCount).toBe(0);
    });
  });

  // --- 未読カウント ---
  describe('unreadCount', () => {
    it('lastReadTimestamp より後の結果を未読としてカウントする', async () => {
      const results = [
        makeResult({ timestamp: 1000 }),
        makeResult({ taskId: 'task-2', timestamp: 3000 }),
        makeResult({ taskId: 'task-3', timestamp: 5000 }),
      ];
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });

      // lastReadTimestamp を 2000 に設定
      localStorage.setItem('iagent-heartbeat-last-read', '2000');

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.results).toHaveLength(3));

      // timestamp > 2000 の結果が2件（3000, 5000）
      expect(result.current.unreadCount).toBe(2);
    });

    it('localStorage に lastReadTimestamp がない場合は全件未読', async () => {
      const results = [makeResult({ timestamp: 1000 })];
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.results).toHaveLength(1));

      expect(result.current.unreadCount).toBe(1);
    });

    it('markAsRead で未読カウントが 0 になる', async () => {
      const results = [makeResult({ timestamp: 5000 })];
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.unreadCount).toBe(1));

      act(() => result.current.markAsRead());
      expect(result.current.unreadCount).toBe(0);

      // localStorage にも反映
      expect(Number(localStorage.getItem('iagent-heartbeat-last-read'))).toBeGreaterThan(0);
    });
  });

  // --- フィルタリング ---
  describe('visibleResults フィルタ', () => {
    it('dismissed な結果は非表示になる', async () => {
      const results = [
        makeResult({ timestamp: 1000, feedback: { type: 'dismissed' as FeedbackType } }),
        makeResult({ taskId: 'task-2', timestamp: 2000 }),
      ];
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.results).toHaveLength(1));

      expect(result.current.results[0].taskId).toBe('task-2');
    });

    it('snoozed で期限内の結果は非表示になる', async () => {
      const futureTime = Date.now() + 3_600_000; // 1時間後
      const results = [
        makeResult({
          timestamp: 1000,
          feedback: { type: 'snoozed' as FeedbackType, snoozedUntil: futureTime },
        }),
      ];
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(mockLoadHeartbeatState).toHaveBeenCalled());

      expect(result.current.results).toHaveLength(0);
    });

    it('accepted な結果は表示される', async () => {
      const results = [
        makeResult({ timestamp: 1000, feedback: { type: 'accepted' as FeedbackType } }),
      ];
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.results).toHaveLength(1));
    });

    it('feedback なしの結果は表示される', async () => {
      const results = [makeResult({ timestamp: 1000 })];
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: results });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.results).toHaveLength(1));
    });
  });

  // --- ピン操作 ---
  describe('togglePin', () => {
    it('togglePinHeartbeatResult を呼んで refresh する', async () => {
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: [makeResult()] });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.results).toHaveLength(1));

      mockLoadHeartbeatState.mockResolvedValue({
        recentResults: [makeResult({ pinned: true })],
      });

      await act(async () => {
        await result.current.togglePin('task-1', 1000);
      });

      expect(mockTogglePin).toHaveBeenCalledWith('task-1', 1000);
      // refresh が呼ばれた（loadHeartbeatState が再呼び出し）
      expect(mockLoadHeartbeatState).toHaveBeenCalledTimes(2);
    });
  });

  // --- フィードバック ---
  describe('sendFeedback', () => {
    it('setHeartbeatFeedback を呼んで refresh する', async () => {
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: [makeResult()] });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.results).toHaveLength(1));

      mockLoadHeartbeatState.mockResolvedValue({ recentResults: [] });

      await act(async () => {
        await result.current.sendFeedback('task-1', 1000, 'dismissed');
      });

      expect(mockSetFeedback).toHaveBeenCalledWith('task-1', 1000, 'dismissed', undefined);
      expect(mockLoadHeartbeatState).toHaveBeenCalledTimes(2);
    });

    it('snoozedUntil を指定できる', async () => {
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: [makeResult()] });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(result.current.results).toHaveLength(1));

      const snoozedUntil = Date.now() + 3_600_000;
      await act(async () => {
        await result.current.sendFeedback('task-1', 1000, 'snoozed', snoozedUntil);
      });

      expect(mockSetFeedback).toHaveBeenCalledWith('task-1', 1000, 'snoozed', snoozedUntil);
    });
  });

  // --- refresh ---
  describe('refresh', () => {
    it('loadHeartbeatState を呼んで結果を更新する', async () => {
      mockLoadHeartbeatState.mockResolvedValue({ recentResults: [] });

      const { result } = await renderHeartbeatPanelHook();
      await waitFor(() => expect(mockLoadHeartbeatState).toHaveBeenCalledTimes(1));

      mockLoadHeartbeatState.mockResolvedValue({
        recentResults: [makeResult({ timestamp: 9000 })],
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.results).toHaveLength(1);
    });
  });
});
