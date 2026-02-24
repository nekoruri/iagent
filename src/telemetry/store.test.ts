import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveTrace, listTraces, getTrace, getUnexportedTraces, markExported, clearTraces } from './store';
import type { TraceRecord } from './types';

vi.mock('../store/db');

// モックDBのリセット
const { __resetStores } = await import('../store/__mocks__/db');

function makeTrace(id: string, startTime: number, exported = false): TraceRecord {
  return {
    traceId: id,
    rootSpanName: `trace-${id}`,
    startTime,
    status: 'ok',
    spans: [{
      traceId: id,
      spanId: 'span' + id,
      name: `span-${id}`,
      kind: 'internal',
      startTimeUnixNano: startTime * 1_000_000,
      endTimeUnixNano: (startTime + 100) * 1_000_000,
      status: 'ok',
      attributes: {},
      events: [],
    }],
    exported,
  };
}

describe('telemetry/store', () => {
  beforeEach(() => {
    __resetStores();
  });

  it('saveTrace + getTrace でトレースを保存・取得できる', async () => {
    const trace = makeTrace('abc', 1000);
    await saveTrace(trace);
    const loaded = await getTrace('abc');
    expect(loaded).toBeDefined();
    expect(loaded!.traceId).toBe('abc');
    expect(loaded!.rootSpanName).toBe('trace-abc');
  });

  it('listTraces は新しい順に取得する', async () => {
    await saveTrace(makeTrace('a', 100));
    await saveTrace(makeTrace('b', 300));
    await saveTrace(makeTrace('c', 200));
    const list = await listTraces();
    expect(list.map((t) => t.traceId)).toEqual(['b', 'c', 'a']);
  });

  it('listTraces は limit で件数を制限する', async () => {
    for (let i = 0; i < 10; i++) {
      await saveTrace(makeTrace(`t${i}`, i * 100));
    }
    const list = await listTraces(3);
    expect(list).toHaveLength(3);
  });

  it('getUnexportedTraces は未エクスポートのトレースのみ返す', async () => {
    await saveTrace(makeTrace('e1', 100, true));
    await saveTrace(makeTrace('e2', 200, false));
    await saveTrace(makeTrace('e3', 300, false));
    const unexported = await getUnexportedTraces();
    expect(unexported.every((t) => !t.exported)).toBe(true);
    expect(unexported.map((t) => t.traceId)).toContain('e2');
    expect(unexported.map((t) => t.traceId)).toContain('e3');
    expect(unexported.map((t) => t.traceId)).not.toContain('e1');
  });

  it('markExported でエクスポート済みフラグを更新する', async () => {
    await saveTrace(makeTrace('m1', 100, false));
    await markExported(['m1']);
    const loaded = await getTrace('m1');
    expect(loaded!.exported).toBe(true);
  });

  it('clearTraces で全トレースを削除する', async () => {
    await saveTrace(makeTrace('c1', 100));
    await saveTrace(makeTrace('c2', 200));
    await clearTraces();
    const list = await listTraces();
    expect(list).toHaveLength(0);
  });

  it('200件を超えたら古いトレースが削除される', async () => {
    for (let i = 0; i < 210; i++) {
      await saveTrace(makeTrace(`over${i}`, i));
    }
    const list = await listTraces(300);
    expect(list.length).toBeLessThanOrEqual(200);
  });
});
