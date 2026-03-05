import { describe, it, expect, beforeEach, vi } from 'vitest';

// configStore の IndexedDB 呼び出しをモック（テスト環境に indexedDB がないため）
vi.mock('../store/configStore', () => ({
  saveConfigToIDB: vi.fn().mockResolvedValue(undefined),
}));

import {
  BUILTIN_HEARTBEAT_TASKS,
  getDefaultHeartbeatConfig,
  getDefaultHeartbeatCostControlConfig,
  getDefaultPersonaConfig,
  getConfig,
  saveConfig,
  getConfigValue,
  isConfigured,
} from './config';
import type { AppConfig } from '../types';

describe('BUILTIN_HEARTBEAT_TASKS', () => {
  it('calendar-check が有効で定義されている', () => {
    const cal = BUILTIN_HEARTBEAT_TASKS.find((t) => t.id === 'calendar-check');
    expect(cal).toBeDefined();
    expect(cal!.enabled).toBe(true);
    expect(cal!.type).toBe('builtin');
  });

  it('weather-check が無効で定義されている', () => {
    const weather = BUILTIN_HEARTBEAT_TASKS.find((t) => t.id === 'weather-check');
    expect(weather).toBeDefined();
    expect(weather!.enabled).toBe(false);
    expect(weather!.type).toBe('builtin');
  });

  it('info-cleanup-check が無効で定義され、fixed-time 20:00 スケジュールを持つ', () => {
    const task = BUILTIN_HEARTBEAT_TASKS.find((t) => t.id === 'info-cleanup-check');
    expect(task).toBeDefined();
    expect(task!.enabled).toBe(false);
    expect(task!.type).toBe('builtin');
    expect(task!.schedule).toEqual({ type: 'fixed-time', hour: 20, minute: 0 });
    expect(task!.description).toContain('getInfoThresholdStatus');
  });

  it('weekly-summary が無効で定義され、fixed-time 21:00 スケジュールを持つ', () => {
    const task = BUILTIN_HEARTBEAT_TASKS.find((t) => t.id === 'weekly-summary');
    expect(task).toBeDefined();
    expect(task!.enabled).toBe(false);
    expect(task!.type).toBe('builtin');
    expect(task!.schedule).toEqual({ type: 'fixed-time', hour: 21, minute: 0 });
    expect(task!.description).toContain('getWeeklyReflections');
    expect(task!.description).toContain('getHeartbeatFeedbackSummary');
    expect(task!.description).toContain('saveReflection');
  });

  it('rss-digest-daily が無効で定義され、fixed-time 08:00 スケジュールを持つ', () => {
    const task = BUILTIN_HEARTBEAT_TASKS.find((t) => t.id === 'rss-digest-daily');
    expect(task).toBeDefined();
    expect(task!.enabled).toBe(false);
    expect(task!.type).toBe('builtin');
    expect(task!.schedule).toEqual({ type: 'fixed-time', hour: 8, minute: 0 });
    expect(task!.description).toContain('listClassifiedFeedItems');
    expect(task!.description).toContain('getCrossSourceTopics');
    expect(task!.description).toContain('listUnreadFeedItems');
  });

  it('briefing-morning が無効で定義され、fixed-time 07:00 スケジュールを持つ', () => {
    const briefing = BUILTIN_HEARTBEAT_TASKS.find((t) => t.id === 'briefing-morning');
    expect(briefing).toBeDefined();
    expect(briefing!.enabled).toBe(false);
    expect(briefing!.type).toBe('builtin');
    expect(briefing!.schedule).toEqual({ type: 'fixed-time', hour: 7, minute: 0 });
    expect(briefing!.description).toContain('ブリーフィング');
  });

  it('briefing-morning の description に getCrossSourceTopics が含まれる', () => {
    const briefing = BUILTIN_HEARTBEAT_TASKS.find((t) => t.id === 'briefing-morning');
    expect(briefing).toBeDefined();
    expect(briefing!.description).toContain('getCrossSourceTopics');
  });

  it('monthly-review が無効で定義され、fixed-time 08:00 スケジュールを持つ', () => {
    const task = BUILTIN_HEARTBEAT_TASKS.find((t) => t.id === 'monthly-review');
    expect(task).toBeDefined();
    expect(task!.enabled).toBe(false);
    expect(task!.type).toBe('builtin');
    expect(task!.schedule).toEqual({ type: 'fixed-time', hour: 8, minute: 0 });
    expect(task!.description).toContain('getMonthlyGoalStats');
    expect(task!.description).toContain('getWeeklyReflections');
    expect(task!.description).toContain('getHeartbeatFeedbackSummary');
    expect(task!.description).toContain('saveReflection');
  });
});

describe('getDefaultHeartbeatConfig', () => {
  it('デフォルト値を返す', () => {
    const config = getDefaultHeartbeatConfig();
    expect(config.enabled).toBe(false);
    expect(config.intervalMinutes).toBe(30);
    expect(config.quietHoursStart).toBe(0);
    expect(config.quietHoursEnd).toBe(6);
    expect(config.desktopNotification).toBe(false);
    expect(config.focusMode).toBe(false);
    expect(config.tasks).toHaveLength(BUILTIN_HEARTBEAT_TASKS.length);
  });

  it('呼び出しごとに新しいオブジェクトを返す', () => {
    const a = getDefaultHeartbeatConfig();
    const b = getDefaultHeartbeatConfig();
    expect(a).not.toBe(b);
    expect(a.tasks).not.toBe(b.tasks);
  });

  it('quietDays のデフォルトは空配列', () => {
    const config = getDefaultHeartbeatConfig();
    expect(config.quietDays).toEqual([]);
  });

  it('maxNotificationsPerDay のデフォルトは 0', () => {
    const config = getDefaultHeartbeatConfig();
    expect(config.maxNotificationsPerDay).toBe(0);
  });

  it('costControl のデフォルトを含む', () => {
    const config = getDefaultHeartbeatConfig();
    expect(config.costControl).toEqual(getDefaultHeartbeatCostControlConfig());
  });
});

describe('getConfig / saveConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage が空のときデフォルト値を返す', () => {
    const config = getConfig();
    expect(config.openaiApiKey).toBe('');
    expect(config.braveApiKey).toBe('');
    expect(config.openWeatherMapApiKey).toBe('');
    expect(config.mcpServers).toEqual([]);
    expect(config.heartbeat).toEqual(getDefaultHeartbeatConfig());
  });

  it('保存した値をパースして返す', () => {
    const saved: AppConfig = {
      openaiApiKey: 'sk-test-123',
      braveApiKey: 'brave-key',
      openWeatherMapApiKey: 'weather-key',
      mcpServers: [],
      heartbeat: getDefaultHeartbeatConfig(),
    };
    saveConfig(saved);
    const loaded = getConfig();
    expect(loaded.openaiApiKey).toBe('sk-test-123');
    expect(loaded.braveApiKey).toBe('brave-key');
    expect(loaded.openWeatherMapApiKey).toBe('weather-key');
  });

  it('部分的なデータの場合フォールバックする', () => {
    localStorage.setItem('iagent-config', JSON.stringify({ openaiApiKey: 'sk-partial' }));
    const config = getConfig();
    expect(config.openaiApiKey).toBe('sk-partial');
    expect(config.braveApiKey).toBe('');
    expect(config.mcpServers).toEqual([]);
    expect(config.heartbeat).toEqual(getDefaultHeartbeatConfig());
  });

  it('既存の heartbeat に desktopNotification が無い場合デフォルト値でマージする', () => {
    const oldHeartbeat = {
      enabled: true,
      intervalMinutes: 15,
      quietHoursStart: 23,
      quietHoursEnd: 7,
      tasks: [],
    };
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      heartbeat: oldHeartbeat,
    }));
    const config = getConfig();
    expect(config.heartbeat!.enabled).toBe(true);
    expect(config.heartbeat!.intervalMinutes).toBe(15);
    expect(config.heartbeat!.desktopNotification).toBe(false);
  });

  it('既存の heartbeat に quietDays/maxNotificationsPerDay が無い場合デフォルトでマージする', () => {
    const oldHeartbeat = {
      enabled: true,
      intervalMinutes: 15,
      quietHoursStart: 23,
      quietHoursEnd: 7,
      tasks: [],
    };
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      heartbeat: oldHeartbeat,
    }));
    const config = getConfig();
    expect(config.heartbeat!.quietDays).toEqual([]);
    expect(config.heartbeat!.maxNotificationsPerDay).toBe(0);
  });

  it('既存の heartbeat に focusMode が無い場合デフォルト false でマージする', () => {
    const oldHeartbeat = {
      enabled: true,
      intervalMinutes: 30,
      quietHoursStart: 0,
      quietHoursEnd: 6,
      tasks: [],
      desktopNotification: false,
    };
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      heartbeat: oldHeartbeat,
    }));
    const config = getConfig();
    expect(config.heartbeat!.focusMode).toBe(false);
  });

  it('既存の heartbeat に costControl が無い場合デフォルトでマージする', () => {
    const oldHeartbeat = {
      enabled: true,
      intervalMinutes: 30,
      quietHoursStart: 0,
      quietHoursEnd: 6,
      tasks: [],
      desktopNotification: false,
      focusMode: false,
    };
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      heartbeat: oldHeartbeat,
    }));
    const config = getConfig();
    expect(config.heartbeat!.costControl).toEqual(getDefaultHeartbeatCostControlConfig());
  });

  it('既存の heartbeat.costControl は部分値でもデフォルトとマージされる', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        tasks: [],
        desktopNotification: false,
        focusMode: false,
        costControl: {
          enabled: false,
          dailyTokenBudget: 12000,
        },
      },
    }));
    const config = getConfig();
    expect(config.heartbeat!.costControl).toEqual({
      enabled: false,
      dailyTokenBudget: 12000,
      pressureThreshold: 0.8,
      deferNonCriticalTasks: true,
    });
  });

  it('保存済み tasks に不足しているビルトインタスクが自動追加される', () => {
    const oldTasks = [
      { id: 'calendar-check', name: 'カレンダーチェック', description: '', enabled: true, type: 'builtin' as const },
    ];
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      heartbeat: { enabled: true, tasks: oldTasks },
    }));
    const config = getConfig();
    const taskIds = config.heartbeat!.tasks.map((t) => t.id);
    // 既存タスクは維持
    expect(taskIds).toContain('calendar-check');
    // 不足しているビルトインタスクが追加
    for (const builtin of BUILTIN_HEARTBEAT_TASKS) {
      expect(taskIds).toContain(builtin.id);
    }
    // 既存タスクの設定は上書きされない
    const cal = config.heartbeat!.tasks.find((t) => t.id === 'calendar-check');
    expect(cal!.enabled).toBe(true);
  });

  it('全ビルトインタスクが揃っている場合は重複追加されない', () => {
    const config1: AppConfig = {
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: getDefaultHeartbeatConfig(),
    };
    saveConfig(config1);
    const loaded = getConfig();
    const builtinCount = loaded.heartbeat!.tasks.filter((t) => t.type === 'builtin').length;
    expect(builtinCount).toBe(BUILTIN_HEARTBEAT_TASKS.length);
  });

  it('タスク時間帯条件（condition）が保存データから復元される', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        desktopNotification: false,
        focusMode: false,
        tasks: [
          {
            id: 'custom-1',
            name: '条件付き',
            description: 'テスト',
            enabled: true,
            type: 'custom',
            condition: {
              type: 'time-window',
              startHour: 9,
              endHour: 18,
            },
          },
        ],
      },
    }));

    const config = getConfig();
    expect(config.heartbeat!.tasks[0].condition).toEqual({
      type: 'time-window',
      startHour: 9,
      endHour: 18,
    });
  });

  it('タスク時間帯条件（condition）の不正値はクランプされる', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        desktopNotification: false,
        focusMode: false,
        tasks: [
          {
            id: 'custom-1',
            name: '条件付き',
            description: 'テスト',
            enabled: true,
            type: 'custom',
            condition: {
              type: 'time-window',
              startHour: -5,
              endHour: 77,
            },
          },
        ],
      },
    }));

    const config = getConfig();
    expect(config.heartbeat!.tasks[0].condition).toEqual({
      type: 'time-window',
      startHour: 0,
      endHour: 23,
    });
  });
});

describe('getConfigValue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('指定キーの値を返す', () => {
    const saved: AppConfig = {
      openaiApiKey: 'sk-value',
      braveApiKey: 'brave-value',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: getDefaultHeartbeatConfig(),
    };
    saveConfig(saved);
    expect(getConfigValue('openaiApiKey')).toBe('sk-value');
    expect(getConfigValue('braveApiKey')).toBe('brave-value');
  });
});

describe('getDefaultPersonaConfig', () => {
  it('デフォルト値を返す', () => {
    const persona = getDefaultPersonaConfig();
    expect(persona.name).toBe('iAgent');
    expect(persona.personality).toBe('');
    expect(persona.tone).toBe('');
    expect(persona.customInstructions).toBe('');
  });

  it('呼び出しごとに新しいオブジェクトを返す', () => {
    const a = getDefaultPersonaConfig();
    const b = getDefaultPersonaConfig();
    expect(a).not.toBe(b);
  });
});

describe('persona in getConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persona 未設定時にデフォルトが返る', () => {
    const config = getConfig();
    expect(config.persona).toEqual(getDefaultPersonaConfig());
  });

  it('部分的な persona がマージされる', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      persona: { name: 'MyBot', personality: '元気' },
    }));
    const config = getConfig();
    expect(config.persona!.name).toBe('MyBot');
    expect(config.persona!.personality).toBe('元気');
    expect(config.persona!.tone).toBe('');
    expect(config.persona!.customInstructions).toBe('');
  });

  it('完全な persona がそのまま返る', () => {
    const fullPersona = {
      name: 'テストボット',
      personality: '丁寧で親しみやすい',
      tone: 'カジュアル',
      customInstructions: '常に日本語で回答',
    };
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      persona: fullPersona,
    }));
    const config = getConfig();
    expect(config.persona).toEqual(fullPersona);
  });
});

describe('theme in getConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('theme 未設定時にデフォルト system が返る', () => {
    const config = getConfig();
    expect(config.theme).toBe('system');
  });

  it('theme が dark の場合 dark が返る', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      theme: 'dark',
    }));
    const config = getConfig();
    expect(config.theme).toBe('dark');
  });

  it('theme が light の場合 light が返る', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      theme: 'light',
    }));
    const config = getConfig();
    expect(config.theme).toBe('light');
  });

  it('不正な theme 値の場合 system にフォールバックする', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      theme: 'invalid-value',
    }));
    const config = getConfig();
    expect(config.theme).toBe('system');
  });

  it('saveConfig でテーマが保存される', () => {
    const config = getConfig();
    saveConfig({ ...config, theme: 'light' });
    const loaded = getConfig();
    expect(loaded.theme).toBe('light');
  });
});

describe('suggestionFrequency in getConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('suggestionFrequency 未設定時に undefined が返る', () => {
    const config = getConfig();
    expect(config.suggestionFrequency).toBeUndefined();
  });

  it('suggestionFrequency が high の場合 high が返る', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      suggestionFrequency: 'high',
    }));
    const config = getConfig();
    expect(config.suggestionFrequency).toBe('high');
  });

  it('suggestionFrequency が medium の場合 medium が返る', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      suggestionFrequency: 'medium',
    }));
    const config = getConfig();
    expect(config.suggestionFrequency).toBe('medium');
  });

  it('suggestionFrequency が low の場合 low が返る', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      suggestionFrequency: 'low',
    }));
    const config = getConfig();
    expect(config.suggestionFrequency).toBe('low');
  });

  it('不正な suggestionFrequency 値の場合 undefined にフォールバックする', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      openaiApiKey: 'sk-test',
      suggestionFrequency: 'invalid-value',
    }));
    const config = getConfig();
    expect(config.suggestionFrequency).toBeUndefined();
  });
});

describe('isConfigured', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('APIキーが空なら false', () => {
    expect(isConfigured()).toBe(false);
  });

  it('APIキーがあれば true', () => {
    const saved: AppConfig = {
      openaiApiKey: 'sk-configured',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: getDefaultHeartbeatConfig(),
    };
    saveConfig(saved);
    expect(isConfigured()).toBe(true);
  });
});
