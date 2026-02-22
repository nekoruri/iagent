import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILTIN_HEARTBEAT_TASKS,
  getDefaultHeartbeatConfig,
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
});

describe('getDefaultHeartbeatConfig', () => {
  it('デフォルト値を返す', () => {
    const config = getDefaultHeartbeatConfig();
    expect(config.enabled).toBe(false);
    expect(config.intervalMinutes).toBe(30);
    expect(config.quietHoursStart).toBe(0);
    expect(config.quietHoursEnd).toBe(6);
    expect(config.tasks).toHaveLength(BUILTIN_HEARTBEAT_TASKS.length);
  });

  it('呼び出しごとに新しいオブジェクトを返す', () => {
    const a = getDefaultHeartbeatConfig();
    const b = getDefaultHeartbeatConfig();
    expect(a).not.toBe(b);
    expect(a.tasks).not.toBe(b.tasks);
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
