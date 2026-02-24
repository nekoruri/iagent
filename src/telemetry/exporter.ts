import { getOtelConfig } from './config';
import { getUnexportedTraces, markExported } from './store';
import type { Span, TraceRecord, AttributeValue } from './types';

/** OTel status code: 0=UNSET, 1=OK, 2=ERROR */
function statusCode(status: string): number {
  switch (status) {
    case 'ok': return 1;
    case 'error': return 2;
    default: return 0;
  }
}

/** OTel span kind: 1=INTERNAL, 2=SERVER, 3=CLIENT */
function spanKindValue(kind: string): number {
  switch (kind) {
    case 'server': return 2;
    case 'client': return 3;
    default: return 1;
  }
}

/** 属性値を OTel のanyValue 形式に変換 */
function toAnyValue(value: AttributeValue): Record<string, unknown> {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

/** Record<string, AttributeValue> → OTel attributes 配列 */
function toOtelAttributes(attrs: Record<string, AttributeValue>): Array<{ key: string; value: Record<string, unknown> }> {
  return Object.entries(attrs).map(([key, value]) => ({
    key,
    value: toAnyValue(value),
  }));
}

/** Span → OTel JSON 形式に変換 */
function spanToOtel(span: Span): Record<string, unknown> {
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId ?? '',
    name: span.name,
    kind: spanKindValue(span.kind),
    startTimeUnixNano: String(span.startTimeUnixNano),
    endTimeUnixNano: String(span.endTimeUnixNano ?? span.startTimeUnixNano),
    status: { code: statusCode(span.status) },
    attributes: toOtelAttributes(span.attributes),
    events: span.events.map((e) => ({
      name: e.name,
      timeUnixNano: String(e.timeUnixNano),
      attributes: e.attributes ? toOtelAttributes(e.attributes) : [],
    })),
  };
}

/** ExportTraceServiceRequest (OTLP/HTTP JSON) ペイロード構築 */
export function buildPayload(traces: TraceRecord[]): Record<string, unknown> {
  const allSpans = traces.flatMap((t) => t.spans);
  return {
    resourceSpans: [{
      resource: {
        attributes: toOtelAttributes({ 'service.name': 'iagent' }),
      },
      scopeSpans: [{
        scope: { name: 'iagent-tracer', version: '1.0.0' },
        spans: allSpans.map(spanToOtel),
      }],
    }],
  };
}

export class OtlpExporter {
  private queue: TraceRecord[] = [];
  private timerId: ReturnType<typeof setInterval> | null = null;

  /** トレースをキューに追加。batchSize に達したら自動送信 */
  enqueue(trace: TraceRecord): void {
    const config = getOtelConfig();
    if (!config.enabled || !config.endpoint) return;

    this.queue.push(trace);
    if (this.queue.length >= config.batchSize) {
      this.flush().catch(() => {});
    }
  }

  /** 定期フラッシュを開始 */
  start(): void {
    if (this.timerId) return;
    const config = getOtelConfig();
    if (!config.enabled) return;

    this.timerId = setInterval(() => {
      this.flush().catch(() => {});
    }, config.flushIntervalMs);
  }

  /** 定期フラッシュを停止 */
  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /** キュー内 + 未エクスポートのトレースを送信 */
  async flush(): Promise<void> {
    const config = getOtelConfig();
    if (!config.enabled || !config.endpoint) return;

    // キューから取り出し
    const queued = this.queue.splice(0);
    // DB から未エクスポート分も取得
    const unexported = await getUnexportedTraces(config.batchSize);
    // 重複排除
    const seen = new Set(queued.map((t) => t.traceId));
    const toSend = [...queued];
    for (const t of unexported) {
      if (!seen.has(t.traceId)) {
        toSend.push(t);
        seen.add(t.traceId);
      }
    }

    if (toSend.length === 0) return;

    try {
      const payload = buildPayload(toSend);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...config.headers,
      };

      const url = config.endpoint.replace(/\/$/, '') + '/v1/traces';
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await markExported(toSend.map((t) => t.traceId));
      }
      // 送信失敗時は次回再試行（キューには戻さない、DB の exported=false で再取得される）
    } catch {
      // ネットワークエラー等は握りつぶす
    }
  }
}

/** グローバルエクスポーターインスタンス */
export const exporter = new OtlpExporter();
