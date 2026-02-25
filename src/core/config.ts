import type { AppConfig, ConfigKey, HeartbeatConfig, HeartbeatTask, OtelConfig, ProxyConfig } from '../types';
import { saveConfigToIDB } from '../store/configStore';

const STORAGE_KEY = 'iagent-config';

export const BUILTIN_HEARTBEAT_TASKS: HeartbeatTask[] = [
  {
    id: 'calendar-check',
    name: 'カレンダーチェック',
    description: '1時間以内に予定があれば通知します。',
    enabled: true,
    type: 'builtin',
  },
  {
    id: 'weather-check',
    name: '天気チェック',
    description: '現在地の天気を確認し、急な天候変化があれば通知します。',
    enabled: false,
    type: 'builtin',
  },
];

export function getDefaultProxyConfig(): ProxyConfig {
  return {
    enabled: false,
    serverUrl: '',
    authToken: '',
    allowedDomains: [],
  };
}

export function getDefaultOtelConfig(): OtelConfig {
  return {
    enabled: false,
    endpoint: '/api/otel',
    headers: {},
    batchSize: 10,
    flushIntervalMs: 30000,
  };
}

export function getDefaultHeartbeatConfig(): HeartbeatConfig {
  return {
    enabled: false,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    tasks: BUILTIN_HEARTBEAT_TASKS.map((t) => ({ ...t })),
    desktopNotification: false,
  };
}

export function getConfig(): AppConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { openaiApiKey: '', braveApiKey: '', openWeatherMapApiKey: '', mcpServers: [], heartbeat: getDefaultHeartbeatConfig(), push: { enabled: false, serverUrl: '' }, proxy: getDefaultProxyConfig(), otel: getDefaultOtelConfig() };
  }
  const parsed = JSON.parse(raw) as Partial<AppConfig>;
  return {
    openaiApiKey: parsed.openaiApiKey ?? '',
    braveApiKey: parsed.braveApiKey ?? '',
    openWeatherMapApiKey: parsed.openWeatherMapApiKey ?? '',
    mcpServers: parsed.mcpServers ?? [],
    heartbeat: parsed.heartbeat
      ? { ...getDefaultHeartbeatConfig(), ...parsed.heartbeat }
      : getDefaultHeartbeatConfig(),
    push: parsed.push ?? { enabled: false, serverUrl: '' },
    proxy: parsed.proxy
      ? { ...getDefaultProxyConfig(), ...parsed.proxy }
      : getDefaultProxyConfig(),
    otel: parsed.otel
      ? { ...getDefaultOtelConfig(), ...parsed.otel }
      : getDefaultOtelConfig(),
  };
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  // Worker 向け: IndexedDB にも非同期書き込み
  saveConfigToIDB(config).catch((e) => console.warn('[iAgent] IndexedDB 設定保存失敗:', e));
}

export function getConfigValue(key: ConfigKey): string {
  return getConfig()[key];
}

export function isConfigured(): boolean {
  const config = getConfig();
  return config.openaiApiKey.length > 0;
}
