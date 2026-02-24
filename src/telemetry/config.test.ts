import { describe, it, expect, beforeEach } from 'vitest';
import { getOtelConfig, getDefaultOtelConfig } from './config';

describe('telemetry/config', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage 未設定時はデフォルト値を返す', () => {
    const config = getOtelConfig();
    expect(config.enabled).toBe(false);
    expect(config.endpoint).toBe('/api/otel');
    expect(config.headers).toEqual({});
    expect(config.batchSize).toBe(10);
    expect(config.flushIntervalMs).toBe(30000);
  });

  it('otel フィールドが無い場合もデフォルト値を返す', () => {
    localStorage.setItem('iagent-config', JSON.stringify({ openaiApiKey: 'sk-test' }));
    const config = getOtelConfig();
    expect(config.enabled).toBe(false);
  });

  it('設定ありの場合に正しく読み取る', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      otel: {
        enabled: true,
        endpoint: 'http://localhost:4318',
        headers: { Authorization: 'Bearer token' },
        batchSize: 20,
        flushIntervalMs: 60000,
      },
    }));
    const config = getOtelConfig();
    expect(config.enabled).toBe(true);
    expect(config.endpoint).toBe('http://localhost:4318');
    expect(config.headers).toEqual({ Authorization: 'Bearer token' });
    expect(config.batchSize).toBe(20);
    expect(config.flushIntervalMs).toBe(60000);
  });

  it('部分的な otel 設定の場合にデフォルトでマージされる', () => {
    localStorage.setItem('iagent-config', JSON.stringify({
      otel: { enabled: true, endpoint: 'http://example.com' },
    }));
    const config = getOtelConfig();
    expect(config.enabled).toBe(true);
    expect(config.endpoint).toBe('http://example.com');
    expect(config.batchSize).toBe(10); // デフォルト
  });

  it('不正な JSON の場合はデフォルト値を返す', () => {
    localStorage.setItem('iagent-config', 'invalid json');
    const config = getOtelConfig();
    expect(config).toEqual(getDefaultOtelConfig());
  });
});
