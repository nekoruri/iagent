import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { buildPayload, OtlpExporter } from './exporter';
import { saveTrace } from './store';
import type { TraceRecord } from './types';

vi.mock('../store/db');

const { __resetStores } = await import('../store/__mocks__/db');

function makeTestTrace(): TraceRecord {
  return {
    traceId: 'a'.repeat(32),
    rootSpanName: 'test.trace',
    startTime: 1000,
    endTime: 2000,
    status: 'ok',
    spans: [
      {
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        name: 'root.span',
        kind: 'internal',
        startTimeUnixNano: 1000_000_000,
        endTimeUnixNano: 2000_000_000,
        status: 'ok',
        attributes: {
          'str.key': 'value',
          'int.key': 42,
          'float.key': 3.14,
          'bool.key': true,
        },
        events: [
          {
            name: 'test.event',
            timeUnixNano: 1500_000_000,
            attributes: { detail: 'info' },
          },
        ],
      },
      {
        traceId: 'a'.repeat(32),
        spanId: 'c'.repeat(16),
        parentSpanId: 'b'.repeat(16),
        name: 'child.span',
        kind: 'client',
        startTimeUnixNano: 1100_000_000,
        endTimeUnixNano: 1900_000_000,
        status: 'error',
        attributes: {},
        events: [],
      },
    ],
    exported: false,
  };
}

describe('buildPayload', () => {
  it('OTLP/HTTP JSON 形式のペイロードを構築する', () => {
    const trace = makeTestTrace();
    const payload = buildPayload([trace]);

    // resourceSpans 構造
    const rs = payload.resourceSpans as Array<Record<string, unknown>>;
    expect(rs).toHaveLength(1);

    // resource.attributes に service.name が含まれる
    const resource = rs[0].resource as { attributes: Array<{ key: string; value: Record<string, unknown> }> };
    const serviceName = resource.attributes.find((a) => a.key === 'service.name');
    expect(serviceName).toBeDefined();
    expect(serviceName!.value).toEqual({ stringValue: 'iagent' });

    // scopeSpans
    const scopeSpans = rs[0].scopeSpans as Array<{ scope: Record<string, unknown>; spans: Array<Record<string, unknown>> }>;
    expect(scopeSpans).toHaveLength(1);
    expect(scopeSpans[0].scope).toEqual({ name: 'iagent-tracer', version: '1.0.0' });

    // spans
    const spans = scopeSpans[0].spans;
    expect(spans).toHaveLength(2);
  });

  it('属性値の型変換が正しい', () => {
    const trace = makeTestTrace();
    const payload = buildPayload([trace]);
    const rs = payload.resourceSpans as Array<Record<string, unknown>>;
    const scopeSpans = rs[0].scopeSpans as Array<{ spans: Array<{ attributes: Array<{ key: string; value: Record<string, unknown> }> }> }>;
    const rootAttrs = scopeSpans[0].spans[0].attributes;

    expect(rootAttrs.find((a) => a.key === 'str.key')!.value).toEqual({ stringValue: 'value' });
    expect(rootAttrs.find((a) => a.key === 'int.key')!.value).toEqual({ intValue: 42 });
    expect(rootAttrs.find((a) => a.key === 'float.key')!.value).toEqual({ doubleValue: 3.14 });
    expect(rootAttrs.find((a) => a.key === 'bool.key')!.value).toEqual({ boolValue: true });
  });

  it('status.code が OTel 仕様通り', () => {
    const trace = makeTestTrace();
    const payload = buildPayload([trace]);
    const rs = payload.resourceSpans as Array<Record<string, unknown>>;
    const scopeSpans = rs[0].scopeSpans as Array<{ spans: Array<{ status: { code: number } }> }>;
    const spans = scopeSpans[0].spans;

    // root: ok → 1
    expect(spans[0].status.code).toBe(1);
    // child: error → 2
    expect(spans[1].status.code).toBe(2);
  });

  it('span kind が正しく変換される', () => {
    const trace = makeTestTrace();
    const payload = buildPayload([trace]);
    const rs = payload.resourceSpans as Array<Record<string, unknown>>;
    const scopeSpans = rs[0].scopeSpans as Array<{ spans: Array<{ kind: number }> }>;
    const spans = scopeSpans[0].spans;

    // internal → 1, client → 3
    expect(spans[0].kind).toBe(1);
    expect(spans[1].kind).toBe(3);
  });
});

describe('OtlpExporter', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetStores();
    localStorage.clear();
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function enableOtel(endpoint = 'http://localhost:4318') {
    localStorage.setItem('iagent-config', JSON.stringify({
      otel: { enabled: true, endpoint, headers: {}, batchSize: 10, flushIntervalMs: 30000 },
    }));
  }

  it('flush() で OTLP ペイロードが送信される', async () => {
    enableOtel();
    const trace = makeTestTrace();
    await saveTrace(trace);

    const exp = new OtlpExporter();
    await exp.flush();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:4318/v1/traces');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.resourceSpans).toBeDefined();
  });

  it('送信成功時に exported=true に更新される', async () => {
    enableOtel();
    const trace = makeTestTrace();
    await saveTrace(trace);

    const exp = new OtlpExporter();
    await exp.flush();

    const { getTrace } = await import('./store');
    const loaded = await getTrace(trace.traceId);
    expect(loaded!.exported).toBe(true);
  });

  it('送信失敗時に例外を投げない', async () => {
    enableOtel();
    fetchSpy.mockRejectedValue(new Error('Network error'));

    const trace = makeTestTrace();
    await saveTrace(trace);

    const exp = new OtlpExporter();
    await expect(exp.flush()).resolves.not.toThrow();
  });

  it('OTel が無効な場合は送信しない', async () => {
    // otel.enabled = false (デフォルト)
    const exp = new OtlpExporter();
    exp.enqueue(makeTestTrace());
    await exp.flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
