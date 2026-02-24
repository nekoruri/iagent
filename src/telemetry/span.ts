import { generateSpanId, nowNano } from './ids';
import type { Span, SpanKind, SpanStatus, SpanEvent, AttributeValue } from './types';

export class SpanBuilder {
  private readonly _traceId: string;
  private readonly _spanId: string;
  private readonly _parentSpanId?: string;
  private readonly _name: string;
  private readonly _kind: SpanKind;
  private readonly _startTimeUnixNano: number;
  private _endTimeUnixNano?: number;
  private _status: SpanStatus = 'unset';
  private _attributes: Record<string, AttributeValue> = {};
  private _events: SpanEvent[] = [];

  constructor(traceId: string, name: string, parentSpanId?: string, kind: SpanKind = 'internal') {
    this._traceId = traceId;
    this._spanId = generateSpanId();
    this._parentSpanId = parentSpanId;
    this._name = name;
    this._kind = kind;
    this._startTimeUnixNano = nowNano();
  }

  get spanId(): string {
    return this._spanId;
  }

  setAttribute(key: string, value: AttributeValue): this {
    this._attributes[key] = value;
    return this;
  }

  setAttributes(attrs: Record<string, AttributeValue>): this {
    Object.assign(this._attributes, attrs);
    return this;
  }

  addEvent(name: string, attributes?: Record<string, AttributeValue>): this {
    this._events.push({
      name,
      timeUnixNano: nowNano(),
      attributes,
    });
    return this;
  }

  setStatus(status: SpanStatus): this {
    this._status = status;
    return this;
  }

  /** スパンを正常終了し、Span オブジェクトを返す */
  end(): Span {
    if (!this._endTimeUnixNano) {
      this._endTimeUnixNano = nowNano();
    }
    if (this._status === 'unset') {
      this._status = 'ok';
    }
    return this.snapshot();
  }

  /** エラーで終了し、Span オブジェクトを返す */
  endWithError(error: unknown): Span {
    this._status = 'error';
    const message = error instanceof Error ? error.message : String(error);
    this.addEvent('exception', { 'exception.message': message });
    if (!this._endTimeUnixNano) {
      this._endTimeUnixNano = nowNano();
    }
    return this.snapshot();
  }

  /** 進行中を含むスナップショットを返す */
  snapshot(): Span {
    return {
      traceId: this._traceId,
      spanId: this._spanId,
      parentSpanId: this._parentSpanId,
      name: this._name,
      kind: this._kind,
      startTimeUnixNano: this._startTimeUnixNano,
      endTimeUnixNano: this._endTimeUnixNano,
      status: this._status,
      attributes: { ...this._attributes },
      events: [...this._events],
    };
  }
}
