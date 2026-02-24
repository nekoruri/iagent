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
