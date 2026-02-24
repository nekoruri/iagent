import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tracer } from './tracer';
import { getTrace } from './store';

vi.mock('../store/db');

const { __resetStores } = await import('../store/__mocks__/db');

describe('Tracer → Store 統合', () => {
  beforeEach(() => {
    __resetStores();
    localStorage.clear();
  });

  it('startTrace → startSpan → finish で IndexedDB に保存される', async () => {
    const trace = tracer.startTrace('test.operation');
    trace.rootSpan.setAttribute('key', 'value');

    const childSpan = trace.startSpan('child.op', trace.rootSpan.spanId);
    childSpan.setAttribute('child.key', 42);
    trace.endSpan(childSpan);

    const record = await trace.finish();

    expect(record.traceId).toHaveLength(32);
    expect(record.rootSpanName).toBe('test.operation');
    expect(record.spans).toHaveLength(2); // root + child
    expect(record.status).toBe('ok');
    expect(record.exported).toBe(false);

    // IndexedDB から取得
    const loaded = await getTrace(record.traceId);
    expect(loaded).toBeDefined();
    expect(loaded!.rootSpanName).toBe('test.operation');
  });

  it('子スパンの parentSpanId が正しく設定される', async () => {
    const trace = tracer.startTrace('parent.test');
    const child = trace.startSpan('child.test');
    trace.endSpan(child);
    const record = await trace.finish();

    const rootSpan = record.spans.find((s) => s.name === 'parent.test');
    const childSpan = record.spans.find((s) => s.name === 'child.test');
    expect(childSpan!.parentSpanId).toBe(rootSpan!.spanId);
  });

  it('エラースパンが TraceRecord.status に反映される', async () => {
    const trace = tracer.startTrace('error.test');
    const child = trace.startSpan('failing.op');
    child.endWithError(new Error('test error'));
    trace.endSpan(child);
    const record = await trace.finish();

    expect(record.status).toBe('error');
  });

  it('未終了の子スパンが finish() で自動終了される', async () => {
    const trace = tracer.startTrace('auto.end.test');
    trace.startSpan('unfinished.child'); // endSpan しない
    const record = await trace.finish();

    expect(record.spans).toHaveLength(2);
    expect(record.spans.every((s) => s.endTimeUnixNano !== undefined)).toBe(true);
  });
});
