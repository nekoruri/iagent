// トレースID・スパンID生成、ナノ秒タイムスタンプ

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** 32文字 hex のトレースID生成 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** 16文字 hex のスパンID生成 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** 現在時刻をナノ秒で返す */
export function nowNano(): number {
  return Math.round((performance.timeOrigin + performance.now()) * 1_000_000);
}
