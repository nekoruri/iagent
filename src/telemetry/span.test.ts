import { describe, it, expect } from 'vitest';
import { SpanBuilder } from './span';

describe('SpanBuilder', () => {
  const traceId = 'a'.repeat(32);

  it('spanId が 16文字 hex で生成される', () => {
    const span = new SpanBuilder(traceId, 'test');
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('setAttribute で属性を設定できる', () => {
    const span = new SpanBuilder(traceId, 'test');
    span.setAttribute('key1', 'value1');
    span.setAttribute('key2', 42);
    const snapshot = span.snapshot();
    expect(snapshot.attributes).toEqual({ key1: 'value1', key2: 42 });
  });

  it('setAttributes で複数属性を一括設定できる', () => {
    const span = new SpanBuilder(traceId, 'test');
    span.setAttributes({ a: 'x', b: true });
    const snapshot = span.snapshot();
    expect(snapshot.attributes).toEqual({ a: 'x', b: true });
  });

  it('addEvent でイベントを追加できる', () => {
    const span = new SpanBuilder(traceId, 'test');
    span.addEvent('event1', { detail: 'info' });
    const snapshot = span.snapshot();
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0].name).toBe('event1');
    expect(snapshot.events[0].attributes).toEqual({ detail: 'info' });
    expect(snapshot.events[0].timeUnixNano).toBeGreaterThan(0);
  });

  it('end() で status を ok に設定し endTimeUnixNano を付与する', () => {
    const span = new SpanBuilder(traceId, 'test');
    const result = span.end();
    expect(result.status).toBe('ok');
    expect(result.endTimeUnixNano).toBeGreaterThan(0);
    expect(result.endTimeUnixNano!).toBeGreaterThanOrEqual(result.startTimeUnixNano);
  });

  it('setStatus で status を指定した場合、end() はその status を維持する', () => {
    const span = new SpanBuilder(traceId, 'test');
    span.setStatus('error');
    const result = span.end();
    expect(result.status).toBe('error');
  });

  it('endWithError でエラー情報を記録する', () => {
    const span = new SpanBuilder(traceId, 'test');
    const result = span.endWithError(new Error('something went wrong'));
    expect(result.status).toBe('error');
    expect(result.endTimeUnixNano).toBeGreaterThan(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe('exception');
    expect(result.events[0].attributes).toEqual({ 'exception.message': 'something went wrong' });
  });

  it('endWithError で文字列エラーを処理できる', () => {
    const span = new SpanBuilder(traceId, 'test');
    const result = span.endWithError('string error');
    expect(result.status).toBe('error');
    expect(result.events[0].attributes).toEqual({ 'exception.message': 'string error' });
  });

  it('parentSpanId を設定できる', () => {
    const span = new SpanBuilder(traceId, 'child', 'parent123');
    const snapshot = span.snapshot();
    expect(snapshot.parentSpanId).toBe('parent123');
  });

  it('snapshot() は進行中の状態を返す', () => {
    const span = new SpanBuilder(traceId, 'test');
    span.setAttribute('x', 1);
    const snapshot = span.snapshot();
    expect(snapshot.name).toBe('test');
    expect(snapshot.status).toBe('unset');
    expect(snapshot.endTimeUnixNano).toBeUndefined();
    expect(snapshot.attributes).toEqual({ x: 1 });
  });
});
