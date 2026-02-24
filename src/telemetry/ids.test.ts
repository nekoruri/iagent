import { describe, it, expect } from 'vitest';
import { generateTraceId, generateSpanId, nowNano } from './ids';

describe('generateTraceId', () => {
  it('32文字の hex 文字列を返す', () => {
    const id = generateTraceId();
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('呼び出しごとにユニークな値を返す', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});

describe('generateSpanId', () => {
  it('16文字の hex 文字列を返す', () => {
    const id = generateSpanId();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('呼び出しごとにユニークな値を返す', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSpanId()));
    expect(ids.size).toBe(100);
  });
});

describe('nowNano', () => {
  it('正の数を返す', () => {
    expect(nowNano()).toBeGreaterThan(0);
  });

  it('ナノ秒精度の値を返す（ミリ秒×10^6 のオーダー）', () => {
    const nano = nowNano();
    // 現在のエポック時刻はおおよそ 1.7×10^18 ナノ秒
    expect(nano).toBeGreaterThan(1_000_000_000_000_000);
  });
});
