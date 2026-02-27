/**
 * 共有 URL バリデーション
 * HTTPS 強制 + localhost 例外 + プライベート IP ブロック（多層防御）。
 * MCP サーバー URL、Push サーバー URL 等で共通利用する。
 */

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlValidationError';
  }
}

/**
 * IP アドレスがプライベートレンジかどうかを判定。
 * server/src/proxy.ts の同名関数から移植（Defense in Depth）。
 */
export function isPrivateIP(hostname: string): boolean {
  // localhost
  if (hostname === 'localhost') return true;

  // IPv6: 角括弧を除去して正規化
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  // IPv6 プライベートレンジ
  if (cleanHost.includes(':')) {
    // ::1 (ループバック)
    if (cleanHost === '::1') return true;
    // :: (未指定アドレス)
    if (cleanHost === '::') return true;
    // fc00::/7 (ULA — Unique Local Address)
    if (/^f[cd]/i.test(cleanHost)) return true;
    // fe80::/10 (リンクローカル)
    if (/^fe[89ab]/i.test(cleanHost)) return true;
    // ::ffff:0:0/96 (IPv4-mapped IPv6) → IPv4 部分を再チェック
    if (/^::ffff:/i.test(cleanHost)) {
      const tail = cleanHost.slice('::ffff:'.length);
      // ドット区切り: ::ffff:192.168.1.1
      const v4Dotted = tail.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
      if (v4Dotted) return isPrivateIP(v4Dotted[1]);
      // 16進表記: ::ffff:c0a8:0101 / ::ffff:7f00:1
      const v4Hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
      if (v4Hex) {
        const hi = parseInt(v4Hex[1], 16);
        const lo = parseInt(v4Hex[2], 16);
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateIP(ipv4);
      }
    }
    return false;
  }

  // IPv4 プライベートレンジ
  const ipv4Match = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 127.0.0.0/8
    if (a === 127) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 (リンクローカル)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0
    if (a === 0) return true;
  }

  return false;
}

/**
 * URL をバリデーションし、正規化して返す。
 * - HTTPS プロトコルを強制（localhost は HTTP を許可）
 * - プライベート IP をブロック（localhost は例外）
 * - 末尾スラッシュを除去
 * @returns 正規化された URL（origin + pathname、末尾スラッシュなし）
 * @throws UrlValidationError 不正な URL の場合
 */
export function validateUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UrlValidationError('URL の形式が正しくありません');
  }

  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new UrlValidationError('URL は https: プロトコルが必要です（localhost を除く）');
  }

  // プライベート IP チェック（localhost は MCP サーバー接続等で使用するため除外）
  if (parsed.hostname !== 'localhost' && isPrivateIP(parsed.hostname)) {
    throw new UrlValidationError('プライベート IP へのアクセスは許可されていません');
  }

  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/**
 * URL が有効かどうかを判定する（例外を投げない版）。
 * @returns エラーメッセージ。有効な場合は null。
 */
export function getUrlValidationError(url: string): string | null {
  try {
    validateUrl(url);
    return null;
  } catch (e) {
    return e instanceof UrlValidationError ? e.message : 'URL の検証に失敗しました';
  }
}
