import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import {
  loadHeartbeatState,
  saveHeartbeatState,
  updateLastChecked,
  addHeartbeatResult,
  updateTaskLastRun,
  getTaskLastRun,
  getAllTaskLastRun,
  batchUpdateTaskLastRun,
  togglePinHeartbeatResult,
  setHeartbeatFeedback,
  filterVisibleResults,
  getHeartbeatFeedbackSummary,
  appendOpsEvent,
  appendOpsEvents,
  loadOpsEvents,
} from './heartbeatStore';
import type { HeartbeatResult, HeartbeatState } from '../types';

beforeEach(() => {
  __resetStores();
});

describe('loadHeartbeatState', () => {
  it('データなしのときデフォルト値を返す', async () => {
    const state = await loadHeartbeatState();
    expect(state.lastChecked).toBe(0);
    expect(state.recentResults).toEqual([]);
  });

  it('保存済みデータがあればそのまま返す', async () => {
    const saved: HeartbeatState = {
      lastChecked: 1000,
      recentResults: [
        { taskId: 'test', timestamp: 1000, hasChanges: true, summary: 'テスト' },
      ],
    };
    await saveHeartbeatState(saved);
    const loaded = await loadHeartbeatState();
    expect(loaded.lastChecked).toBe(1000);
    expect(loaded.recentResults).toHaveLength(1);
    expect(loaded.recentResults[0].taskId).toBe('test');
  });
});

describe('saveHeartbeatState', () => {
  it('状態を保存できる', async () => {
    const state: HeartbeatState = {
      lastChecked: 2000,
      recentResults: [],
    };
    await saveHeartbeatState(state);
    const loaded = await loadHeartbeatState();
    expect(loaded.lastChecked).toBe(2000);
  });
});

describe('updateLastChecked', () => {
  it('lastChecked のみ更新される', async () => {
    const result: HeartbeatResult = {
      taskId: 'task-1',
      timestamp: 1000,
      hasChanges: false,
      summary: '変化なし',
    };
    await addHeartbeatResult(result);

    await updateLastChecked(5000);

    const state = await loadHeartbeatState();
    expect(state.lastChecked).toBe(5000);
    expect(state.recentResults).toHaveLength(1);
  });
});

describe('addHeartbeatResult', () => {
  it('結果を先頭に追加し lastChecked を更新する', async () => {
    const r1: HeartbeatResult = {
      taskId: 'task-1',
      timestamp: 1000,
      hasChanges: true,
      summary: '結果1',
    };
    const r2: HeartbeatResult = {
      taskId: 'task-2',
      timestamp: 2000,
      hasChanges: false,
      summary: '結果2',
    };

    await addHeartbeatResult(r1);
    await addHeartbeatResult(r2);

    const state = await loadHeartbeatState();
    expect(state.recentResults).toHaveLength(2);
    expect(state.recentResults[0].taskId).toBe('task-2');
    expect(state.recentResults[1].taskId).toBe('task-1');
    expect(state.lastChecked).toBe(2000);
  });

  it('50件を超えると古い結果が切り捨てられる', async () => {
    for (let i = 0; i < 55; i++) {
      await addHeartbeatResult({
        taskId: `task-${i}`,
        timestamp: i * 1000,
        hasChanges: false,
        summary: `結果${i}`,
      });
    }

    const state = await loadHeartbeatState();
    expect(state.recentResults).toHaveLength(50);
    // 最新が先頭
    expect(state.recentResults[0].taskId).toBe('task-54');
  });
});

describe('addHeartbeatResult (pinned 保護)', () => {
  it('pinned 結果が FIFO で押し出されない', async () => {
    // pinned 結果を 3 件追加
    for (let i = 0; i < 3; i++) {
      await addHeartbeatResult({
        taskId: `pinned-${i}`,
        timestamp: i * 1000,
        hasChanges: true,
        summary: `ピン留め ${i}`,
        pinned: true,
      });
    }
    // unpinned 結果を 50 件追加（上限超過を引き起こす）
    for (let i = 0; i < 50; i++) {
      await addHeartbeatResult({
        taskId: `unpinned-${i}`,
        timestamp: (i + 100) * 1000,
        hasChanges: false,
        summary: `通常 ${i}`,
      });
    }

    const state = await loadHeartbeatState();
    expect(state.recentResults).toHaveLength(50);
    // pinned 結果がすべて残っている
    const pinnedResults = state.recentResults.filter(r => r.pinned);
    expect(pinnedResults).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(pinnedResults.find(r => r.taskId === `pinned-${i}`)).toBeDefined();
    }
  });

  it('pinned が上限を超えると古い pinned が切り捨てられる', async () => {
    // pinned 結果を 55 件追加
    for (let i = 0; i < 55; i++) {
      await addHeartbeatResult({
        taskId: `pinned-${i}`,
        timestamp: i * 1000,
        hasChanges: true,
        summary: `ピン留め ${i}`,
        pinned: true,
      });
    }

    const state = await loadHeartbeatState();
    // pinned も上限（50件）で切り捨てられる
    expect(state.recentResults.length).toBeLessThanOrEqual(50);
    const pinnedResults = state.recentResults.filter(r => r.pinned);
    expect(pinnedResults).toHaveLength(50);
    // 新しい方が残っている
    expect(pinnedResults[0].timestamp).toBe(54 * 1000);
  });
});

describe('togglePinHeartbeatResult', () => {
  it('結果のピン状態を切り替えできる', async () => {
    await addHeartbeatResult({
      taskId: 'task-1',
      timestamp: 1000,
      hasChanges: true,
      summary: 'テスト',
    });

    // ピン留め
    await togglePinHeartbeatResult('task-1', 1000);
    let state = await loadHeartbeatState();
    expect(state.recentResults[0].pinned).toBe(true);

    // ピン解除
    await togglePinHeartbeatResult('task-1', 1000);
    state = await loadHeartbeatState();
    expect(state.recentResults[0].pinned).toBe(false);
  });

  it('存在しない結果に対しては何もしない', async () => {
    await addHeartbeatResult({
      taskId: 'task-1',
      timestamp: 1000,
      hasChanges: true,
      summary: 'テスト',
    });

    await togglePinHeartbeatResult('nonexistent', 9999);
    const state = await loadHeartbeatState();
    expect(state.recentResults).toHaveLength(1);
    expect(state.recentResults[0].pinned).toBeUndefined();
  });
});

describe('updateTaskLastRun / getTaskLastRun', () => {
  it('未登録タスクの lastRun は 0', async () => {
    const lastRun = await getTaskLastRun('nonexistent');
    expect(lastRun).toBe(0);
  });

  it('タスクごとの lastRun を保存・取得できる', async () => {
    await updateTaskLastRun('task-a', 1000);
    await updateTaskLastRun('task-b', 2000);

    expect(await getTaskLastRun('task-a')).toBe(1000);
    expect(await getTaskLastRun('task-b')).toBe(2000);
  });

  it('同じタスクの lastRun を上書きできる', async () => {
    await updateTaskLastRun('task-a', 1000);
    await updateTaskLastRun('task-a', 5000);

    expect(await getTaskLastRun('task-a')).toBe(5000);
  });

  it('getAllTaskLastRun で全タスクの lastRun を一括取得できる', async () => {
    await updateTaskLastRun('task-a', 1000);
    await updateTaskLastRun('task-b', 2000);
    await updateTaskLastRun('task-c', 3000);

    const map = await getAllTaskLastRun();
    expect(map).toEqual({ 'task-a': 1000, 'task-b': 2000, 'task-c': 3000 });
  });

  it('getAllTaskLastRun は未登録時に空オブジェクトを返す', async () => {
    const map = await getAllTaskLastRun();
    expect(map).toEqual({});
  });

  it('batchUpdateTaskLastRun で複数タスクを一括更新できる', async () => {
    await updateTaskLastRun('task-a', 1000);
    await batchUpdateTaskLastRun(['task-a', 'task-b', 'task-c'], 5000);

    expect(await getTaskLastRun('task-a')).toBe(5000);
    expect(await getTaskLastRun('task-b')).toBe(5000);
    expect(await getTaskLastRun('task-c')).toBe(5000);
  });

  it('taskLastRun は他の状態に影響しない', async () => {
    await addHeartbeatResult({
      taskId: 'task-1',
      timestamp: 3000,
      hasChanges: false,
      summary: '',
    });
    await updateTaskLastRun('task-1', 5000);

    const state = await loadHeartbeatState();
    expect(state.recentResults).toHaveLength(1);
    expect(state.lastChecked).toBe(3000);
    expect(state.taskLastRun?.['task-1']).toBe(5000);
  });
});

describe('setHeartbeatFeedback', () => {
  it('accepted フィードバックを設定できる', async () => {
    await addHeartbeatResult({
      taskId: 'task-1',
      timestamp: 1000,
      hasChanges: true,
      summary: 'テスト',
    });

    await setHeartbeatFeedback('task-1', 1000, 'accepted');

    const state = await loadHeartbeatState();
    expect(state.recentResults[0].feedback).toBeDefined();
    expect(state.recentResults[0].feedback!.type).toBe('accepted');
    expect(state.recentResults[0].feedback!.timestamp).toBeGreaterThan(0);
  });

  it('dismissed フィードバックを設定できる', async () => {
    await addHeartbeatResult({
      taskId: 'task-1',
      timestamp: 1000,
      hasChanges: true,
      summary: 'テスト',
    });

    await setHeartbeatFeedback('task-1', 1000, 'dismissed');

    const state = await loadHeartbeatState();
    expect(state.recentResults[0].feedback!.type).toBe('dismissed');
  });

  it('snoozed フィードバックに snoozedUntil を設定できる', async () => {
    await addHeartbeatResult({
      taskId: 'task-1',
      timestamp: 1000,
      hasChanges: true,
      summary: 'テスト',
    });

    const snoozedUntil = Date.now() + 3600000;
    await setHeartbeatFeedback('task-1', 1000, 'snoozed', snoozedUntil);

    const state = await loadHeartbeatState();
    expect(state.recentResults[0].feedback!.type).toBe('snoozed');
    expect(state.recentResults[0].feedback!.snoozedUntil).toBe(snoozedUntil);
  });

  it('snoozed で snoozedUntil 未指定時にデフォルト値が設定される', async () => {
    await addHeartbeatResult({
      taskId: 'task-1',
      timestamp: 1000,
      hasChanges: true,
      summary: 'テスト',
    });

    const before = Date.now();
    await setHeartbeatFeedback('task-1', 1000, 'snoozed');

    const state = await loadHeartbeatState();
    expect(state.recentResults[0].feedback!.type).toBe('snoozed');
    // snoozedUntil が 1 時間後のフォールバック値で設定される
    expect(state.recentResults[0].feedback!.snoozedUntil).toBeGreaterThanOrEqual(before + 3600_000 - 100);
    expect(state.recentResults[0].feedback!.snoozedUntil).toBeDefined();
  });

  it('存在しない結果には何もしない', async () => {
    await addHeartbeatResult({
      taskId: 'task-1',
      timestamp: 1000,
      hasChanges: true,
      summary: 'テスト',
    });

    await setHeartbeatFeedback('nonexistent', 9999, 'accepted');

    const state = await loadHeartbeatState();
    expect(state.recentResults[0].feedback).toBeUndefined();
  });
});

describe('filterVisibleResults', () => {
  const baseResult = (overrides: Partial<HeartbeatResult>): HeartbeatResult => ({
    taskId: 'task-1',
    timestamp: 1000,
    hasChanges: true,
    summary: 'テスト',
    ...overrides,
  });

  it('feedback なしの結果を表示する', () => {
    const results = [baseResult({})];
    expect(filterVisibleResults(results)).toHaveLength(1);
  });

  it('accepted の結果を表示する', () => {
    const results = [baseResult({
      feedback: { type: 'accepted', timestamp: 2000 },
    })];
    expect(filterVisibleResults(results)).toHaveLength(1);
  });

  it('dismissed の結果を非表示にする', () => {
    const results = [baseResult({
      feedback: { type: 'dismissed', timestamp: 2000 },
    })];
    expect(filterVisibleResults(results)).toHaveLength(0);
  });

  it('snoozed で期限前の結果を非表示にする', () => {
    const now = 5000;
    const results = [baseResult({
      feedback: { type: 'snoozed', timestamp: 2000, snoozedUntil: 10000 },
    })];
    expect(filterVisibleResults(results, now)).toHaveLength(0);
  });

  it('snoozed で期限後の結果を表示する', () => {
    const now = 15000;
    const results = [baseResult({
      feedback: { type: 'snoozed', timestamp: 2000, snoozedUntil: 10000 },
    })];
    expect(filterVisibleResults(results, now)).toHaveLength(1);
  });

  it('snoozed で snoozedUntil 欠損時は表示する（永久非表示防止）', () => {
    const results = [baseResult({
      feedback: { type: 'snoozed', timestamp: 2000 },
    })];
    expect(filterVisibleResults(results)).toHaveLength(1);
  });

  it('混在する結果を正しくフィルタする', () => {
    const now = 15000;
    const results = [
      baseResult({ taskId: 'a' }),
      baseResult({ taskId: 'b', feedback: { type: 'accepted', timestamp: 2000 } }),
      baseResult({ taskId: 'c', feedback: { type: 'dismissed', timestamp: 2000 } }),
      baseResult({ taskId: 'd', feedback: { type: 'snoozed', timestamp: 2000, snoozedUntil: 10000 } }),
      baseResult({ taskId: 'e', feedback: { type: 'snoozed', timestamp: 2000, snoozedUntil: 20000 } }),
    ];
    const visible = filterVisibleResults(results, now);
    expect(visible).toHaveLength(3);
    expect(visible.map(r => r.taskId)).toEqual(['a', 'b', 'd']);
  });
});

describe('getHeartbeatFeedbackSummary', () => {
  it('フィードバックをタスク別に集計する', async () => {
    const now = Date.now();
    // タスク A: accepted 2件, dismissed 1件
    await addHeartbeatResult({ taskId: 'task-a', timestamp: now - 1000, hasChanges: true, summary: 'A-1' });
    await setHeartbeatFeedback('task-a', now - 1000, 'accepted');
    await addHeartbeatResult({ taskId: 'task-a', timestamp: now - 2000, hasChanges: true, summary: 'A-2' });
    await setHeartbeatFeedback('task-a', now - 2000, 'accepted');
    await addHeartbeatResult({ taskId: 'task-a', timestamp: now - 3000, hasChanges: true, summary: 'A-3' });
    await setHeartbeatFeedback('task-a', now - 3000, 'dismissed');

    // タスク B: snoozed 1件
    await addHeartbeatResult({ taskId: 'task-b', timestamp: now - 4000, hasChanges: true, summary: 'B-1' });
    await setHeartbeatFeedback('task-b', now - 4000, 'snoozed');

    const summary = await getHeartbeatFeedbackSummary();
    expect(summary.totalResults).toBe(4);
    expect(summary.totalWithFeedback).toBe(4);

    const statsA = summary.taskStats.find(s => s.taskId === 'task-a');
    expect(statsA).toBeDefined();
    expect(statsA!.accepted).toBe(2);
    expect(statsA!.dismissed).toBe(1);
    expect(statsA!.snoozed).toBe(0);
    expect(statsA!.total).toBe(3);
    // Accept 率 = 2/3 ≈ 0.667
    expect(statsA!.acceptRate).toBeCloseTo(2 / 3, 2);

    const statsB = summary.taskStats.find(s => s.taskId === 'task-b');
    expect(statsB).toBeDefined();
    expect(statsB!.snoozed).toBe(1);
    expect(statsB!.acceptRate).toBe(0);
  });

  it('期間フィルタが正しく動作する', async () => {
    const now = Date.now();
    const HOUR_MS = 60 * 60 * 1000;

    // 2時間前の結果
    await addHeartbeatResult({ taskId: 'task-a', timestamp: now - 2 * HOUR_MS, hasChanges: true, summary: '古い' });
    await setHeartbeatFeedback('task-a', now - 2 * HOUR_MS, 'accepted');

    // 30分前の結果
    await addHeartbeatResult({ taskId: 'task-b', timestamp: now - 0.5 * HOUR_MS, hasChanges: true, summary: '新しい' });
    await setHeartbeatFeedback('task-b', now - 0.5 * HOUR_MS, 'dismissed');

    // 1時間分のみ集計
    const summary = await getHeartbeatFeedbackSummary(1 * HOUR_MS);
    expect(summary.totalResults).toBe(1);
    expect(summary.taskStats).toHaveLength(1);
    expect(summary.taskStats[0].taskId).toBe('task-b');
  });

  it('Accept 率を正しく計算する', async () => {
    const now = Date.now();
    // 3件 accepted, 1件 dismissed → Accept率 75%
    for (let i = 0; i < 3; i++) {
      await addHeartbeatResult({ taskId: 'task-x', timestamp: now - (i + 1) * 1000, hasChanges: true, summary: `X-${i}` });
      await setHeartbeatFeedback('task-x', now - (i + 1) * 1000, 'accepted');
    }
    await addHeartbeatResult({ taskId: 'task-x', timestamp: now - 4000, hasChanges: true, summary: 'X-3' });
    await setHeartbeatFeedback('task-x', now - 4000, 'dismissed');

    const summary = await getHeartbeatFeedbackSummary();
    expect(summary.overallAcceptRate).toBeCloseTo(0.75, 2);
    expect(summary.taskStats[0].acceptRate).toBeCloseTo(0.75, 2);
  });

  it('フィードバックなしの結果は totalResults に含まれるが totalWithFeedback に含まれない', async () => {
    const now = Date.now();
    await addHeartbeatResult({ taskId: 'task-a', timestamp: now - 1000, hasChanges: true, summary: 'フィードバックなし' });
    await addHeartbeatResult({ taskId: 'task-a', timestamp: now - 2000, hasChanges: true, summary: 'あり' });
    await setHeartbeatFeedback('task-a', now - 2000, 'accepted');

    const summary = await getHeartbeatFeedbackSummary();
    expect(summary.totalResults).toBe(2);
    expect(summary.totalWithFeedback).toBe(1);
  });

  it('結果なしで正常な空サマリーを返す', async () => {
    const summary = await getHeartbeatFeedbackSummary();
    expect(summary.totalResults).toBe(0);
    expect(summary.totalWithFeedback).toBe(0);
    expect(summary.overallAcceptRate).toBe(0);
    expect(summary.taskStats).toEqual([]);
  });
});

describe('ops events', () => {
  it('appendOpsEvent でイベントを保存・読み込みできる', async () => {
    const now = Date.now();
    await appendOpsEvent({
      type: 'notification-shown',
      timestamp: now,
      source: 'tab',
      channel: 'desktop',
      notificationTag: 'heartbeat-test',
    });

    const events = await loadOpsEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      type: 'notification-shown',
      source: 'tab',
      channel: 'desktop',
      notificationTag: 'heartbeat-test',
    }));
  });

  it('appendOpsEvents は保持期間外のイベントを除外する', async () => {
    const now = Date.now();
    const oldTs = now - (31 * 24 * 60 * 60 * 1000);
    await appendOpsEvents([
      {
        type: 'heartbeat-run',
        timestamp: oldTs,
        source: 'worker',
        status: 'success',
      },
      {
        type: 'heartbeat-run',
        timestamp: now,
        source: 'worker',
        status: 'failure',
      },
    ]);

    const events = await loadOpsEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      type: 'heartbeat-run',
      status: 'failure',
      source: 'worker',
    }));
  });
});
