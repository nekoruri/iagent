// OTel 互換の軽量トレーシング型定義

export type SpanKind = 'internal' | 'client' | 'server';
export type SpanStatus = 'unset' | 'ok' | 'error';
export type AttributeValue = string | number | boolean;

export interface SpanEvent {
  name: string;
  timeUnixNano: number;
  attributes?: Record<string, AttributeValue>;
}

export interface Span {
  traceId: string;       // 32文字 hex
  spanId: string;        // 16文字 hex
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTimeUnixNano: number;
  endTimeUnixNano?: number;
  status: SpanStatus;
  attributes: Record<string, AttributeValue>;
  events: SpanEvent[];
}

export interface TraceRecord {
  traceId: string;
  rootSpanName: string;
  startTime: number;     // Date.now() ベース (IndexedDB インデックス用)
  endTime?: number;
  status: SpanStatus;
  spans: Span[];
  exported: boolean;
}

export interface OtelConfig {
  enabled: boolean;
  endpoint: string;
  headers: Record<string, string>;
  batchSize: number;
  flushIntervalMs: number;
}
