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

  it('pinned が上限を超えてもすべて保持される', async () => {
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
    // すべての pinned が保持される（上限超えても pinned は削除されない）
    expect(state.recentResults.length).toBeGreaterThanOrEqual(55);
    const pinnedResults = state.recentResults.filter(r => r.pinned);
    expect(pinnedResults).toHaveLength(55);
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
