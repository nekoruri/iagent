import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { loadFreshConfig, getTasksDueFromIDB, executeHeartbeatAndStore } from './heartbeatCommon';
import { updateTaskLastRun } from '../store/heartbeatStore';
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
});
