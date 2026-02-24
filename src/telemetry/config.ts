// OTel 設定読み取り (循環依存回避のため localStorage から直接読み取る)

import type { OtelConfig } from './types';

const STORAGE_KEY = 'iagent-config';

const DEFAULT_CONFIG: OtelConfig = {
  enabled: false,
  endpoint: '/api/otel',
  headers: {},
  batchSize: 10,
  flushIntervalMs: 30000,
};

export function getOtelConfig(): OtelConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    const otel = parsed?.otel;
    if (!otel) return { ...DEFAULT_CONFIG };
    return {
      enabled: otel.enabled ?? false,
      endpoint: otel.endpoint ?? '',
      headers: otel.headers ?? {},
      batchSize: otel.batchSize ?? 10,
      flushIntervalMs: otel.flushIntervalMs ?? 30000,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function getDefaultOtelConfig(): OtelConfig {
  return { ...DEFAULT_CONFIG };
}
