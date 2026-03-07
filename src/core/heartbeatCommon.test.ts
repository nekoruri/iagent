import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { loadFreshConfig, getTasksDueFromIDB, executeHeartbeatAndStore } from './heartbeatCommon';
import { appendOpsEvent, getAllTaskLastRun, getTaskLastRun, loadOpsEvents, updateTaskLastRun } from '../store/heartbeatStore';
import type { HeartbeatConfig, HeartbeatTask } from '../types';

function makeConfig(overrides?: Partial<HeartbeatConfig>): HeartbeatConfig {
  return {
    enabled: true,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 0,
    tasks: [],
    desktopNotification: false,
    ...overrides,
  };
}

beforeEach(() => {
  __resetStores();
});

describe('loadFreshConfig', () => {
  it('IndexedDB に設定がなければフォールバック値を返す', async () => {
    const result = await loadFreshConfig('sk-fallback', makeConfig());
    expect(result.apiKey).toBe('sk-fallback');
    expect(result.heartbeat.intervalMinutes).toBe(30);
  });

  it('IndexedDB に設定があればそちらを優先する', async () => {
    // configStore 経由で IndexedDB に設定を書き込む
    const { saveConfigToIDB } = await import('../store/configStore');
    await saveConfigToIDB({
      openaiApiKey: 'sk-from-idb',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeConfig({ intervalMinutes: 15 }),
    });

    const result = await loadFreshConfig('sk-fallback', makeConfig());
    expect(result.apiKey).toBe('sk-from-idb');
    expect(result.heartbeat.intervalMinutes).toBe(15);
  });

  it('IndexedDB の apiKey が空ならフォールバックを使う', async () => {
    const { saveConfigToIDB } = await import('../store/configStore');
    await saveConfigToIDB({
      openaiApiKey: '',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeConfig({ intervalMinutes: 10 }),
    });

    const result = await loadFreshConfig('sk-fallback', makeConfig());
    expect(result.apiKey).toBe('sk-fallback');
    expect(result.heartbeat.intervalMinutes).toBe(10);
  });
});

describe('getTasksDueFromIDB', () => {
  const globalTask: HeartbeatTask = {
    id: 'global-task',
    name: 'グローバルタスク',
    description: 'テスト',
    enabled: true,
    type: 'custom',
  };

  const intervalTask: HeartbeatTask = {
    id: 'interval-task',
    name: 'インターバルタスク',
    description: 'テスト',
    enabled: true,
    type: 'custom',
    schedule: { type: 'interval', intervalMinutes: 60 },
  };

  const disabledTask: HeartbeatTask = {
    id: 'disabled-task',
    name: '無効タスク',
    description: 'テスト',
    enabled: false,
    type: 'custom',
  };

  const conditionTask: HeartbeatTask = {
    id: 'condition-task',
    name: '条件付きタスク',
    description: 'テスト',
    enabled: true,
    type: 'custom',
    condition: { type: 'time-window', startHour: 9, endHour: 18 },
  };

  it('lastChecked=0 のグローバルタスクは実行される', async () => {
    const config = makeConfig({ tasks: [globalTask] });
    const due = await getTasksDueFromIDB(config);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('global-task');
  });

  it('interval タスクは lastRun=0 なら実行される', async () => {
    const config = makeConfig({ tasks: [intervalTask] });
    const due = await getTasksDueFromIDB(config);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('interval-task');
  });

  it('interval タスクは間隔内だと実行されない', async () => {
    await updateTaskLastRun('interval-task', Date.now());
    const config = makeConfig({ tasks: [intervalTask] });
    const due = await getTasksDueFromIDB(config);
    expect(due).toHaveLength(0);
  });

  it('無効タスクは実行されない', async () => {
    const config = makeConfig({ tasks: [disabledTask] });
    const due = await getTasksDueFromIDB(config);
    expect(due).toHaveLength(0);
  });

  describe('時間帯条件', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('条件時間内なら実行対象になる', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-06T10:00:00'));
      const config = makeConfig({ tasks: [conditionTask] });
      const due = await getTasksDueFromIDB(config);
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('condition-task');
    });

    it('条件時間外なら実行対象にならない', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-06T20:00:00'));
      const config = makeConfig({ tasks: [conditionTask] });
      const due = await getTasksDueFromIDB(config);
      expect(due).toHaveLength(0);
    });
  });
});

describe('pinned 判定', () => {
  // executeHeartbeatAndStore 内のピン留め条件をテスト
  const isPinned = (taskId: string) =>
    taskId.startsWith('briefing-') || taskId === 'reflection' || taskId === 'monthly-review';

  it('briefing- プレフィックスのタスクは pinned', () => {
    expect(isPinned('briefing-morning')).toBe(true);
    expect(isPinned('briefing-custom')).toBe(true);
  });

  it('reflection は pinned', () => {
    expect(isPinned('reflection')).toBe(true);
  });

  it('monthly-review は pinned', () => {
    expect(isPinned('monthly-review')).toBe(true);
  });

  it('その他のタスクは pinned でない', () => {
    expect(isPinned('calendar-check')).toBe(false);
    expect(isPinned('feed-check')).toBe(false);
    expect(isPinned('weekly-summary')).toBe(false);
  });
});

describe('executeHeartbeatAndStore', () => {
  it('設定がなければ空結果を返す', async () => {
    // IndexedDB に設定なし → 空結果
    const { results, configChanged } = await executeHeartbeatAndStore('sk-test');
    expect(results).toEqual([]);
    expect(configChanged).toBe(false);
  });

  it('enabled=false なら空結果を返す', async () => {
    const { saveConfigToIDB } = await import('../store/configStore');
    await saveConfigToIDB({
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeConfig({ enabled: false }),
    });

    const { results, configChanged } = await executeHeartbeatAndStore('sk-test');
    expect(results).toEqual([]);
    expect(configChanged).toBe(false);
  });

  it('API キーが空なら空結果を返す', async () => {
    const { saveConfigToIDB } = await import('../store/configStore');
    await saveConfigToIDB({
      openaiApiKey: '',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeConfig({
        tasks: [{
          id: 'test',
          name: 'test',
          description: 'test',
          enabled: true,
          type: 'custom',
        }],
      }),
    });

    const { results, configChanged } = await executeHeartbeatAndStore('');
    expect(results).toEqual([]);
    expect(configChanged).toBe(false);
    const events = await loadOpsEvents();
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'autonomy-stage',
        stage: 'trigger',
        source: 'unknown',
      }),
      expect.objectContaining({
        type: 'autonomy-stage',
        stage: 'context',
        source: 'unknown',
        contextSnapshot: expect.objectContaining({
          timeOfDay: expect.any(String),
        }),
      }),
      expect.objectContaining({
        type: 'heartbeat-run',
        stage: 'decision',
        reason: 'no_api_key',
      }),
    ]));
  });

  it('タスクがなければ空結果を返す', async () => {
    const { saveConfigToIDB } = await import('../store/configStore');
    await saveConfigToIDB({
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeConfig({ tasks: [] }),
    });

    const { results, configChanged } = await executeHeartbeatAndStore('sk-test');
    expect(results).toEqual([]);
    expect(configChanged).toBe(false);
  });

  it('LLM 呼び出し前に taskLastRun を先制更新する', async () => {
    const { saveConfigToIDB } = await import('../store/configStore');
    const task: HeartbeatTask = {
      id: 'pre-update-test',
      name: 'テスト',
      description: 'テスト',
      enabled: true,
      type: 'custom',
    };
    await saveConfigToIDB({
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeConfig({ tasks: [task] }),
    });

    // executeWorkerHeartbeatCheck をモックして LLM 呼び出しを回避
    const heartbeatOpenAI = await import('./heartbeatOpenAI');
    const spy = vi.spyOn(heartbeatOpenAI, 'executeWorkerHeartbeatCheck').mockResolvedValue({
      results: [],
      configChanged: false,
      usage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        byModel: {},
      },
    });

    await executeHeartbeatAndStore('sk-test');

    // batchUpdateTaskLastRun により taskLastRun が更新済み
    const lastRunMap = await getAllTaskLastRun();
    expect(lastRunMap['pre-update-test']).toBeGreaterThan(0);

    spy.mockRestore();
  });

  it('日次トークン予算を超過している場合は実行をスキップする', async () => {
    const { saveConfigToIDB } = await import('../store/configStore');
    const task: HeartbeatTask = {
      id: 'budget-test',
      name: 'テスト',
      description: 'テスト',
      enabled: true,
      type: 'custom',
    };
    await saveConfigToIDB({
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeConfig({
        tasks: [task],
        costControl: {
          enabled: true,
          dailyTokenBudget: 100,
          pressureThreshold: 0.8,
          deferNonCriticalTasks: true,
        },
      }),
    });
    await appendOpsEvent({
      type: 'heartbeat-run',
      status: 'success',
      source: 'worker',
      timestamp: Date.now(),
      totalTokens: 150,
    });
    const heartbeatOpenAI = await import('./heartbeatOpenAI');
    const spy = vi.spyOn(heartbeatOpenAI, 'executeWorkerHeartbeatCheck');

    const { results, configChanged } = await executeHeartbeatAndStore('sk-test');

    expect(results).toEqual([]);
    expect(configChanged).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(await getTaskLastRun('budget-test')).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('予算逼迫時は non-critical タスクを次回回しする', async () => {
    const { saveConfigToIDB } = await import('../store/configStore');
    const task: HeartbeatTask = {
      id: 'feed-check',
      name: 'フィードチェック',
      description: 'テスト',
      enabled: true,
      type: 'builtin',
    };
    await saveConfigToIDB({
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeConfig({
        tasks: [task],
        costControl: {
          enabled: true,
          dailyTokenBudget: 1000,
          pressureThreshold: 0.8,
          deferNonCriticalTasks: true,
        },
      }),
    });
    await appendOpsEvent({
      type: 'heartbeat-run',
      status: 'success',
      source: 'worker',
      timestamp: Date.now(),
      totalTokens: 850,
    });
    const heartbeatOpenAI = await import('./heartbeatOpenAI');
    const spy = vi.spyOn(heartbeatOpenAI, 'executeWorkerHeartbeatCheck');

    const { results } = await executeHeartbeatAndStore('sk-test');

    expect(results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    expect(await getTaskLastRun('feed-check')).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('予算逼迫時でも critical タスクは縮退モードで実行する', async () => {
    const { saveConfigToIDB } = await import('../store/configStore');
    const task: HeartbeatTask = {
      id: 'calendar-check',
      name: 'カレンダー',
      description: 'テスト',
      enabled: true,
      type: 'builtin',
    };
    await saveConfigToIDB({
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeConfig({
        tasks: [task],
        costControl: {
          enabled: true,
          dailyTokenBudget: 1000,
          pressureThreshold: 0.8,
          deferNonCriticalTasks: true,
        },
      }),
    });
    await appendOpsEvent({
      type: 'heartbeat-run',
      status: 'success',
      source: 'worker',
      timestamp: Date.now(),
      totalTokens: 850,
    });
    const heartbeatOpenAI = await import('./heartbeatOpenAI');
    const spy = vi.spyOn(heartbeatOpenAI, 'executeWorkerHeartbeatCheck').mockResolvedValue({
      results: [],
      configChanged: false,
      usage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        byModel: {},
      },
    });

    await executeHeartbeatAndStore('sk-test');

    expect(spy).toHaveBeenCalledWith(
      'sk-test',
      expect.arrayContaining([expect.objectContaining({ id: 'calendar-check' })]),
      expect.any(Array),
      expect.any(Array),
      expect.any(Object),
      { degradedMode: true },
    );
    spy.mockRestore();
  });
});
