import type { AppConfig, ConfigKey } from '../types';

const STORAGE_KEY = 'iagent-config';

export function getConfig(): AppConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { openaiApiKey: '', braveApiKey: '', openWeatherMapApiKey: '' };
  }
  return JSON.parse(raw) as AppConfig;
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getConfigValue(key: ConfigKey): string {
  return getConfig()[key];
}

export function isConfigured(): boolean {
  const config = getConfig();
  return config.openaiApiKey.length > 0;
}
