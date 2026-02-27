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
    await updateTaskLastRun('global-task', Date.now());
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

  it('schedule.type=fixed-time のタスクは指定時刻以降で判定される', async () => {
    // 対象時刻(8:00)を過ぎていて今日まだ未実行なら due
    const config = makeConfig({ tasks: [fixedTimeTask] });
    const now = new Date();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const targetTotalMinutes = 8 * 60; // 8:00
    const due = await getTasksDue(config);

    if (currentTotalMinutes >= targetTotalMinutes) {
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

// --- executeCheck / tick / runNow テスト ---
// vi.doMock + vi.resetModules + 動的 import で各テストに独立したモック環境を構築

describe('HeartbeatEngine - executeCheck', () => {
  const testTask: HeartbeatTask = {
    id: 'test-task',
    name: 'テストタスク',
    description: 'テスト用タスク',
    enabled: true,
    type: 'custom',
  };

  const heartbeatConfig: HeartbeatConfig = {
    enabled: true,
    intervalMinutes: 1,
    quietHoursStart: 0,
    quietHoursEnd: 0,
    tasks: [testTask],
    desktopNotification: false,
  };

  let mockRun: ReturnType<typeof vi.fn>;
  let mockAddEvent: ReturnType<typeof vi.fn>;
  let mockEndWithError: ReturnType<typeof vi.fn>;
  let mockAddHeartbeatResult: ReturnType<typeof vi.fn>;
  let mockUpdateLastCheckedFn: ReturnType<typeof vi.fn>;
  let mockUpdateTaskLastRunFn: ReturnType<typeof vi.fn>;

  function setupMocks(configOverrides?: Partial<{ openaiApiKey: string; heartbeat: HeartbeatConfig }>) {
    mockRun = vi.fn();
    mockAddEvent = vi.fn();
    mockEndWithError = vi.fn();
    mockAddHeartbeatResult = vi.fn().mockResolvedValue(undefined);
    mockUpdateLastCheckedFn = vi.fn().mockResolvedValue(undefined);
    mockUpdateTaskLastRunFn = vi.fn().mockResolvedValue(undefined);

    vi.resetModules();

    vi.doMock('../store/db', async () => {
      return await import('../store/__mocks__/db');
    });

    vi.doMock('./config', () => ({
      getConfig: vi.fn().mockReturnValue({
        openaiApiKey: configOverrides?.openaiApiKey ?? 'sk-test-key',
        braveApiKey: '',
        openWeatherMapApiKey: '',
        mcpServers: [],
        heartbeat: configOverrides?.heartbeat ?? heartbeatConfig,
      }),
    }));

    vi.doMock('../telemetry/tracer', () => ({
      tracer: {
        startTrace: vi.fn().mockReturnValue({
          rootSpan: {
            setAttribute: vi.fn(),
            addEvent: mockAddEvent,
            endWithError: mockEndWithError,
          },
          finish: vi.fn().mockResolvedValue(undefined),
        }),
      },
    }));

    vi.doMock('../telemetry/semantics', () => ({
      LLM_ATTRS: { SYSTEM: 'gen_ai.system', MODEL: 'gen_ai.request.model' },
      HEARTBEAT_ATTRS: { TASK_COUNT: 'heartbeat.task.count', TASK_ID: 'heartbeat.task.id', HAS_CHANGES: 'heartbeat.has_changes' },
    }));

    vi.doMock('@openai/agents', () => ({
      run: mockRun,
      user: (msg: string) => ({ role: 'user', content: msg }),
    }));

    vi.doMock('@openai/agents-openai', () => ({
      setDefaultOpenAIClient: vi.fn(),
    }));

    vi.doMock('openai', () => ({
      default: vi.fn().mockImplementation(() => ({})),
    }));

    vi.doMock('./agent', () => ({
      createHeartbeatAgent: vi.fn().mockResolvedValue({ name: 'mock-agent' }),
    }));

    vi.doMock('../store/heartbeatStore', () => ({
      loadHeartbeatState: vi.fn().mockResolvedValue({ lastChecked: 0, recentResults: [] }),
      addHeartbeatResult: mockAddHeartbeatResult,
      updateLastChecked: mockUpdateLastCheckedFn,
      updateTaskLastRun: mockUpdateTaskLastRunFn,
      getTaskLastRun: vi.fn().mockResolvedValue(0),
    }));
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2025, 0, 1, 12, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('API キー未設定でスキップする', async () => {
    setupMocks({ openaiApiKey: '' });

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockAddEvent).toHaveBeenCalledWith('heartbeat.skip', { reason: 'no_api_key' });

    engine.stop();
  });

  it('Agent 実行成功 + hasChanges=true でリスナー通知する', async () => {
    setupMocks();
    mockRun.mockResolvedValue({
      finalOutput: JSON.stringify({
        results: [{ taskId: 'test-task', hasChanges: true, summary: '変更あり' }],
      }),
    });

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockRun).toHaveBeenCalled();
    expect(mockAddHeartbeatResult).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({ taskId: 'test-task', hasChanges: true }),
        ]),
      }),
    );

    engine.stop();
  });

  it('Agent 実行成功 + hasChanges=false で通知しない', async () => {
    setupMocks();
    mockRun.mockResolvedValue({
      finalOutput: JSON.stringify({
        results: [{ taskId: 'test-task', hasChanges: false, summary: '' }],
      }),
    });

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockRun).toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();

    engine.stop();
  });

  it('finalOutput が string でない場合スキップする', async () => {
    setupMocks();
    mockRun.mockResolvedValue({ finalOutput: 42 });

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockAddEvent).toHaveBeenCalledWith('heartbeat.skip', { reason: 'no_string_output' });
    expect(mockAddHeartbeatResult).not.toHaveBeenCalled();

    engine.stop();
  });

  it('JSON パース失敗時にエラーハンドリングする', async () => {
    setupMocks();
    mockRun.mockResolvedValue({ finalOutput: 'not json at all' });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();

    await vi.advanceTimersByTimeAsync(60_000);

    // JSON にマッチしない → no_json_match でスキップ
    expect(mockAddEvent).toHaveBeenCalledWith('heartbeat.skip', { reason: 'no_json_match' });

    engine.stop();
    consoleErrorSpy.mockRestore();
  });

  it('Agent 実行エラーで lastChecked を更新する（無限リトライ防止）', async () => {
    setupMocks();
    mockRun.mockRejectedValue(new Error('API エラー'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(mockEndWithError).toHaveBeenCalled();
    expect(mockUpdateLastCheckedFn).toHaveBeenCalled();

    engine.stop();
    consoleErrorSpy.mockRestore();
  });

  it('結果を heartbeatStore に保存する', async () => {
    setupMocks();
    mockRun.mockResolvedValue({
      finalOutput: JSON.stringify({
        results: [{ taskId: 'test-task', hasChanges: true, summary: 'テスト結果' }],
      }),
    });

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockAddHeartbeatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'test-task',
        hasChanges: true,
        summary: 'テスト結果',
      }),
    );
    expect(mockUpdateTaskLastRunFn).toHaveBeenCalledWith('test-task', expect.any(Number));

    engine.stop();
  });
});

describe('HeartbeatEngine - tick', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2025, 0, 1, 12, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('isExecuting=true でスキップする', async () => {
    const mockRunSlow = vi.fn();
    mockRunSlow.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ finalOutput: '{}' }), 120_000)));

    vi.resetModules();
    vi.doMock('../store/db', async () => await import('../store/__mocks__/db'));
    vi.doMock('./config', () => ({
      getConfig: vi.fn().mockReturnValue({
        openaiApiKey: 'sk-test',
        heartbeat: {
          enabled: true, intervalMinutes: 1,
          quietHoursStart: 0, quietHoursEnd: 0,
          tasks: [{ id: 't', name: 't', description: 't', enabled: true, type: 'custom' as const }],
          desktopNotification: false,
        },
      }),
    }));
    vi.doMock('@openai/agents', () => ({ run: mockRunSlow, user: (msg: string) => ({ role: 'user', content: msg }) }));
    vi.doMock('@openai/agents-openai', () => ({ setDefaultOpenAIClient: vi.fn() }));
    vi.doMock('openai', () => ({ default: vi.fn().mockImplementation(() => ({})) }));
    vi.doMock('./agent', () => ({ createHeartbeatAgent: vi.fn().mockResolvedValue({}) }));
    vi.doMock('../telemetry/tracer', () => ({
      tracer: {
        startTrace: vi.fn().mockReturnValue({
          rootSpan: { setAttribute: vi.fn(), addEvent: vi.fn(), endWithError: vi.fn() },
          finish: vi.fn().mockResolvedValue(undefined),
        }),
      },
    }));
    vi.doMock('../telemetry/semantics', () => ({
      LLM_ATTRS: { SYSTEM: 'a', MODEL: 'b' },
      HEARTBEAT_ATTRS: { TASK_COUNT: 'c', TASK_ID: 'd', HAS_CHANGES: 'e' },
    }));
    vi.doMock('../store/heartbeatStore', () => ({
      loadHeartbeatState: vi.fn().mockResolvedValue({ lastChecked: 0, recentResults: [] }),
      addHeartbeatResult: vi.fn().mockResolvedValue(undefined),
      updateLastChecked: vi.fn().mockResolvedValue(undefined),
      updateTaskLastRun: vi.fn().mockResolvedValue(undefined),
      getTaskLastRun: vi.fn().mockResolvedValue(0),
    }));

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();

    // 1 回目の tick で executeCheck 開始（実行中）
    await vi.advanceTimersByTimeAsync(60_000);
    // 2 回目の tick → isExecuting=true なのでスキップされる
    await vi.advanceTimersByTimeAsync(60_000);

    // run は 1 回しか呼ばれない（2回目はスキップ）
    expect(mockRunSlow).toHaveBeenCalledTimes(1);

    engine.stop();
  });

  it('enabled=false でスキップする', async () => {
    const mockRunFn = vi.fn();
    vi.resetModules();
    vi.doMock('../store/db', async () => await import('../store/__mocks__/db'));
    vi.doMock('./config', () => ({
      getConfig: vi.fn().mockReturnValue({
        openaiApiKey: 'sk-test',
        heartbeat: {
          enabled: false,
          intervalMinutes: 1,
          quietHoursStart: 0, quietHoursEnd: 0,
          tasks: [{ id: 't', name: 't', description: 't', enabled: true, type: 'custom' as const }],
          desktopNotification: false,
        },
      }),
    }));
    vi.doMock('@openai/agents', () => ({ run: mockRunFn, user: (msg: string) => ({ role: 'user', content: msg }) }));
    vi.doMock('@openai/agents-openai', () => ({ setDefaultOpenAIClient: vi.fn() }));
    vi.doMock('openai', () => ({ default: vi.fn().mockImplementation(() => ({})) }));
    vi.doMock('./agent', () => ({ createHeartbeatAgent: vi.fn().mockResolvedValue({}) }));
    vi.doMock('../telemetry/tracer', () => ({
      tracer: {
        startTrace: vi.fn().mockReturnValue({
          rootSpan: { setAttribute: vi.fn(), addEvent: vi.fn(), endWithError: vi.fn() },
          finish: vi.fn().mockResolvedValue(undefined),
        }),
      },
    }));
    vi.doMock('../telemetry/semantics', () => ({
      LLM_ATTRS: { SYSTEM: 'a', MODEL: 'b' },
      HEARTBEAT_ATTRS: { TASK_COUNT: 'c', TASK_ID: 'd', HAS_CHANGES: 'e' },
    }));
    vi.doMock('../store/heartbeatStore', () => ({
      loadHeartbeatState: vi.fn().mockResolvedValue({ lastChecked: 0, recentResults: [] }),
      addHeartbeatResult: vi.fn().mockResolvedValue(undefined),
      updateLastChecked: vi.fn().mockResolvedValue(undefined),
      updateTaskLastRun: vi.fn().mockResolvedValue(undefined),
      getTaskLastRun: vi.fn().mockResolvedValue(0),
    }));

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockRunFn).not.toHaveBeenCalled();
    engine.stop();
  });

  it('quiet hours 内でスキップする', async () => {
    vi.setSystemTime(new Date(2025, 0, 1, 3, 0, 0));
    const mockRunFn = vi.fn();
    vi.resetModules();
    vi.doMock('../store/db', async () => await import('../store/__mocks__/db'));
    vi.doMock('./config', () => ({
      getConfig: vi.fn().mockReturnValue({
        openaiApiKey: 'sk-test',
        heartbeat: {
          enabled: true,
          intervalMinutes: 1,
          quietHoursStart: 0, quietHoursEnd: 6,
          tasks: [{ id: 't', name: 't', description: 't', enabled: true, type: 'custom' as const }],
          desktopNotification: false,
        },
      }),
    }));
    vi.doMock('@openai/agents', () => ({ run: mockRunFn, user: (msg: string) => ({ role: 'user', content: msg }) }));
    vi.doMock('@openai/agents-openai', () => ({ setDefaultOpenAIClient: vi.fn() }));
    vi.doMock('openai', () => ({ default: vi.fn().mockImplementation(() => ({})) }));
    vi.doMock('./agent', () => ({ createHeartbeatAgent: vi.fn().mockResolvedValue({}) }));
    vi.doMock('../telemetry/tracer', () => ({
      tracer: {
        startTrace: vi.fn().mockReturnValue({
          rootSpan: { setAttribute: vi.fn(), addEvent: vi.fn(), endWithError: vi.fn() },
          finish: vi.fn().mockResolvedValue(undefined),
        }),
      },
    }));
    vi.doMock('../telemetry/semantics', () => ({
      LLM_ATTRS: { SYSTEM: 'a', MODEL: 'b' },
      HEARTBEAT_ATTRS: { TASK_COUNT: 'c', TASK_ID: 'd', HAS_CHANGES: 'e' },
    }));
    vi.doMock('../store/heartbeatStore', () => ({
      loadHeartbeatState: vi.fn().mockResolvedValue({ lastChecked: 0, recentResults: [] }),
      addHeartbeatResult: vi.fn().mockResolvedValue(undefined),
      updateLastChecked: vi.fn().mockResolvedValue(undefined),
      updateTaskLastRun: vi.fn().mockResolvedValue(undefined),
      getTaskLastRun: vi.fn().mockResolvedValue(0),
    }));

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockRunFn).not.toHaveBeenCalled();
    engine.stop();
  });

  it('実行すべきタスクなしでスキップする', async () => {
    const mockRunFn = vi.fn();
    vi.resetModules();
    vi.doMock('../store/db', async () => await import('../store/__mocks__/db'));
    vi.doMock('./config', () => ({
      getConfig: vi.fn().mockReturnValue({
        openaiApiKey: 'sk-test',
        heartbeat: {
          enabled: true,
          intervalMinutes: 1,
          quietHoursStart: 0, quietHoursEnd: 0,
          tasks: [],
          desktopNotification: false,
        },
      }),
    }));
    vi.doMock('@openai/agents', () => ({ run: mockRunFn, user: (msg: string) => ({ role: 'user', content: msg }) }));
    vi.doMock('@openai/agents-openai', () => ({ setDefaultOpenAIClient: vi.fn() }));
    vi.doMock('openai', () => ({ default: vi.fn().mockImplementation(() => ({})) }));
    vi.doMock('./agent', () => ({ createHeartbeatAgent: vi.fn().mockResolvedValue({}) }));
    vi.doMock('../telemetry/tracer', () => ({
      tracer: {
        startTrace: vi.fn().mockReturnValue({
          rootSpan: { setAttribute: vi.fn(), addEvent: vi.fn(), endWithError: vi.fn() },
          finish: vi.fn().mockResolvedValue(undefined),
        }),
      },
    }));
    vi.doMock('../telemetry/semantics', () => ({
      LLM_ATTRS: { SYSTEM: 'a', MODEL: 'b' },
      HEARTBEAT_ATTRS: { TASK_COUNT: 'c', TASK_ID: 'd', HAS_CHANGES: 'e' },
    }));
    vi.doMock('../store/heartbeatStore', () => ({
      loadHeartbeatState: vi.fn().mockResolvedValue({ lastChecked: 0, recentResults: [] }),
      addHeartbeatResult: vi.fn().mockResolvedValue(undefined),
      updateLastChecked: vi.fn().mockResolvedValue(undefined),
      updateTaskLastRun: vi.fn().mockResolvedValue(undefined),
      getTaskLastRun: vi.fn().mockResolvedValue(0),
    }));

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockRunFn).not.toHaveBeenCalled();
    engine.stop();
  });
});

describe('HeartbeatEngine - runNow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2025, 0, 1, 12, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tick を即時呼び出す', async () => {
    const mockRunFn = vi.fn().mockResolvedValue({
      finalOutput: JSON.stringify({
        results: [{ taskId: 'test', hasChanges: false, summary: '' }],
      }),
    });

    vi.resetModules();
    vi.doMock('../store/db', async () => await import('../store/__mocks__/db'));
    vi.doMock('./config', () => ({
      getConfig: vi.fn().mockReturnValue({
        openaiApiKey: 'sk-test',
        heartbeat: {
          enabled: true,
          intervalMinutes: 1,
          quietHoursStart: 0, quietHoursEnd: 0,
          tasks: [{ id: 'test', name: 'test', description: 'test', enabled: true, type: 'custom' as const }],
          desktopNotification: false,
        },
      }),
    }));
    vi.doMock('@openai/agents', () => ({ run: mockRunFn, user: (msg: string) => ({ role: 'user', content: msg }) }));
    vi.doMock('@openai/agents-openai', () => ({ setDefaultOpenAIClient: vi.fn() }));
    vi.doMock('openai', () => ({ default: vi.fn().mockImplementation(() => ({})) }));
    vi.doMock('./agent', () => ({ createHeartbeatAgent: vi.fn().mockResolvedValue({}) }));
    vi.doMock('../telemetry/tracer', () => ({
      tracer: {
        startTrace: vi.fn().mockReturnValue({
          rootSpan: { setAttribute: vi.fn(), addEvent: vi.fn(), endWithError: vi.fn() },
          finish: vi.fn().mockResolvedValue(undefined),
        }),
      },
    }));
    vi.doMock('../telemetry/semantics', () => ({
      LLM_ATTRS: { SYSTEM: 'a', MODEL: 'b' },
      HEARTBEAT_ATTRS: { TASK_COUNT: 'c', TASK_ID: 'd', HAS_CHANGES: 'e' },
    }));
    vi.doMock('../store/heartbeatStore', () => ({
      loadHeartbeatState: vi.fn().mockResolvedValue({ lastChecked: 0, recentResults: [] }),
      addHeartbeatResult: vi.fn().mockResolvedValue(undefined),
      updateLastChecked: vi.fn().mockResolvedValue(undefined),
      updateTaskLastRun: vi.fn().mockResolvedValue(undefined),
      getTaskLastRun: vi.fn().mockResolvedValue(0),
    }));

    const { HeartbeatEngine: FreshEngine } = await import('./heartbeat');
    const engine = new FreshEngine(() => []);
    engine.start();

    await engine.runNow();

    expect(mockRunFn).toHaveBeenCalledTimes(1);
    engine.stop();
  });
});
