import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import {
  loadHeartbeatState,
  saveHeartbeatState,
  updateLastChecked,
  addHeartbeatResult,
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
