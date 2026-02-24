import { generateTraceId } from './ids';
import { SpanBuilder } from './span';
import { saveTrace } from './store';
import { exporter } from './exporter';
import { getOtelConfig } from './config';
import type { Span, TraceRecord, SpanKind } from './types';

export class ActiveTrace {
  readonly traceId: string;
  readonly rootSpan: SpanBuilder;
  private _childSpans: SpanBuilder[] = [];
  private _finishedSpans: Span[] = [];

  constructor(name: string) {
    this.traceId = generateTraceId();
    this.rootSpan = new SpanBuilder(this.traceId, name);
  }

  /** 子スパンを開始 */
  startSpan(name: string, parentSpanId?: string, kind: SpanKind = 'internal'): SpanBuilder {
    const span = new SpanBuilder(this.traceId, name, parentSpanId ?? this.rootSpan.spanId, kind);
    this._childSpans.push(span);
    return span;
  }

  /** 子スパンの終了を記録 */
  endSpan(span: SpanBuilder): Span {
    const finished = span.end();
    this._finishedSpans.push(finished);
    this._childSpans = this._childSpans.filter((s) => s !== span);
    return finished;
  }

  /** トレースを終了し、IndexedDB に保存 + エクスポーター送信 */
  async finish(): Promise<TraceRecord> {
    // 未終了の子スパンを自動終了
    for (const child of this._childSpans) {
      this._finishedSpans.push(child.end());
    }
    this._childSpans = [];

    const rootFinished = this.rootSpan.end();
    const allSpans = [rootFinished, ...this._finishedSpans];

    // トレース全体のステータス: いずれかがエラーならエラー
    const hasError = allSpans.some((s) => s.status === 'error');

    const record: TraceRecord = {
      traceId: this.traceId,
      rootSpanName: rootFinished.name,
      startTime: Math.round(rootFinished.startTimeUnixNano / 1_000_000),
      endTime: rootFinished.endTimeUnixNano
        ? Math.round(rootFinished.endTimeUnixNano / 1_000_000)
        : undefined,
      status: hasError ? 'error' : rootFinished.status,
      spans: allSpans,
      exported: false,
    };

    try {
      await saveTrace(record);
    } catch (e) {
      console.warn('[iAgent Telemetry] トレース保存失敗:', e);
    }

    // OTel エクスポーター送信 + 定期フラッシュ起動
    const config = getOtelConfig();
    if (config.enabled && config.endpoint) {
      exporter.enqueue(record);
      exporter.start();
    }

    return record;
  }
}

/** トレーサーシングルトン */
class Tracer {
  /** 新しいトレースを開始 */
  startTrace(name: string): ActiveTrace {
    return new ActiveTrace(name);
  }
}

export const tracer = new Tracer();
