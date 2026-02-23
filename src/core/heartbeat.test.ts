import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { isQuietHours, getTasksDue, HeartbeatEngine } from './heartbeat';
import { updateLastChecked, updateTaskLastRun } from '../store/heartbeatStore';
import type { HeartbeatConfig, HeartbeatTask } from '../types';

function makeConfig(overrides?: Partial<HeartbeatConfig>): HeartbeatConfig {
  return {
    enabled: true,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    tasks: [],
    desktopNotification: false,
    ...overrides,
  };
}

function dateAt(hour: number): Date {
  const d = new Date(2025, 0, 1, hour, 0, 0);
  return d;
}

beforeEach(() => {
  __resetStores();
});

describe('isQuietHours', () => {
  it('通常範囲(0-6時): 3時 → true', () => {
    expect(isQuietHours(makeConfig(), dateAt(3))).toBe(true);
  });

  it('通常範囲(0-6時): 0時(境界) → true', () => {
    expect(isQuietHours(makeConfig(), dateAt(0))).toBe(true);
  });

  it('通常範囲(0-6時): 6時(境界) → false', () => {
    expect(isQuietHours(makeConfig(), dateAt(6))).toBe(false);
  });

  it('通常範囲(0-6時): 12時 → false', () => {
    expect(isQuietHours(makeConfig(), dateAt(12))).toBe(false);
  });

  it('日またぎ(23-6時): 1時 → true', () => {
    expect(isQuietHours(makeConfig({ quietHoursStart: 23, quietHoursEnd: 6 }), dateAt(1))).toBe(true);
  });

  it('日またぎ(23-6時): 23時 → true', () => {
    expect(isQuietHours(makeConfig({ quietHoursStart: 23, quietHoursEnd: 6 }), dateAt(23))).toBe(true);
  });

  it('日またぎ(23-6時): 12時 → false', () => {
    expect(isQuietHours(makeConfig({ quietHoursStart: 23, quietHoursEnd: 6 }), dateAt(12))).toBe(false);
  });

  it('日またぎ(23-6時): 6時(境界) → false', () => {
    expect(isQuietHours(makeConfig({ quietHoursStart: 23, quietHoursEnd: 6 }), dateAt(6))).toBe(false);
  });

  it('start === end: サイレント時間なし → 常に false', () => {
    expect(isQuietHours(makeConfig({ quietHoursStart: 3, quietHoursEnd: 3 }), dateAt(3))).toBe(false);
    expect(isQuietHours(makeConfig({ quietHoursStart: 3, quietHoursEnd: 3 }), dateAt(12))).toBe(false);
  });
});

describe('HeartbeatEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start/stop でタイマーが制御される', () => {
    const engine = new HeartbeatEngine(() => []);
    engine.start();
    // 二重 start は無視される（エラーにならない）
    engine.start();
    engine.stop();
    // stop 後の二重 stop もエラーにならない
    engine.stop();
  });

  it('subscribe/unsubscribe が動作する', () => {
    const engine = new HeartbeatEngine(() => []);
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('setAgentBusy(true) でチェックがスキップされる', async () => {
    // getConfig をモックして heartbeat.enabled = true にする
    vi.doMock('./config', () => ({
      getConfig: () => ({
        openaiApiKey: 'sk-test',
        braveApiKey: '',
        openWeatherMapApiKey: '',
        mcpServers: [],
        heartbeat: {
          enabled: true,
          intervalMinutes: 1,
          quietHoursStart: 0,
          quietHoursEnd: 0,
          tasks: [{ id: 'test', name: 'test', description: 'test', enabled: true, type: 'builtin' as const }],
        },
      }),
    }));

    const engine = new HeartbeatEngine(() => []);
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.setAgentBusy(true);
    engine.start();

    // tick が発火しても busy なのでリスナーは呼ばれない
    vi.advanceTimersByTime(120_000);
    expect(listener).not.toHaveBeenCalled();

    engine.stop();
  });
});

describe('getTasksDue', () => {
  const globalTask: HeartbeatTask = {
    id: 'global-task',
    name: 'グローバルタスク',
    description: 'テスト',
    enabled: true,
    type: 'custom',
  };

  const globalTaskExplicit: HeartbeatTask = {
    id: 'global-explicit',
    name: 'グローバル明示タスク',
    description: 'テスト',
    enabled: true,
    type: 'custom',
    schedule: { type: 'global' },
  };

  const intervalTask: HeartbeatTask = {
    id: 'interval-task',
    name: 'インターバルタスク',
    description: 'テスト',
    enabled: true,
    type: 'custom',
    schedule: { type: 'interval', intervalMinutes: 60 },
  };

  const fixedTimeTask: HeartbeatTask = {
    id: 'fixed-task',
    name: '固定時刻タスク',
    description: 'テスト',
    enabled: true,
    type: 'custom',
    schedule: { type: 'fixed-time', hour: 8, minute: 0 },
  };

  const disabledTask: HeartbeatTask = {
    id: 'disabled-task',
    name: '無効タスク',
    description: 'テスト',
    enabled: false,
    type: 'custom',
  };

  it('schedule未設定のタスクはグローバル間隔で判定される', async () => {
    // lastChecked=0 なのでグローバル間隔(30分)を超過 → due
    const config = makeConfig({ tasks: [globalTask] });
    const due = await getTasksDue(config);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('global-task');
  });

  it('schedule.type=global のタスクはグローバル間隔で判定される', async () => {
    const config = makeConfig({ tasks: [globalTaskExplicit] });
    const due = await getTasksDue(config);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('global-explicit');
  });

  it('グローバルタスクは間隔内だと実行されない', async () => {
    await updateLastChecked(Date.now());
    const config = makeConfig({ tasks: [globalTask] });
    const due = await getTasksDue(config);
    expect(due).toHaveLength(0);
  });

  it('schedule.type=interval のタスクは個別間隔で判定される', async () => {
    // lastRun=0 なのでインターバル(60分)を超過 → due
    const config = makeConfig({ tasks: [intervalTask] });
    const due = await getTasksDue(config);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('interval-task');
  });

  it('interval タスクは間隔内だと実行されない', async () => {
    await updateTaskLastRun('interval-task', Date.now());
    const config = makeConfig({ tasks: [intervalTask] });
    const due = await getTasksDue(config);
    expect(due).toHaveLength(0);
  });

  it('schedule.type=fixed-time のタスクは指定時刻でのみ判定される', async () => {
    // 現在時刻が8:00でない限り実行されない
    const config = makeConfig({ tasks: [fixedTimeTask] });
    const now = new Date();
    const due = await getTasksDue(config);

    if (now.getHours() === 8 && Math.abs(now.getMinutes() - 0) <= 1) {
      expect(due).toHaveLength(1);
    } else {
      expect(due).toHaveLength(0);
    }
  });

  it('固定時刻タスクは同日2回実行されない', async () => {
    // 今日の時刻でlastRunを設定
    await updateTaskLastRun('fixed-task', Date.now());
    const config = makeConfig({ tasks: [fixedTimeTask] });
    const due = await getTasksDue(config);
    // lastRun が今日なので、たとえ指定時刻でも実行されない
    expect(due).toHaveLength(0);
  });

  it('無効なタスクは実行されない', async () => {
    const config = makeConfig({ tasks: [disabledTask] });
    const due = await getTasksDue(config);
    expect(due).toHaveLength(0);
  });
});
