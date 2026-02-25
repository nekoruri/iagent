/**
 * 共有 URL バリデーション
 * HTTPS 強制 + localhost 例外。MCP サーバー URL、Push サーバー URL 等で共通利用する。
 */

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlValidationError';
  }
}

/**
 * URL をバリデーションし、正規化して返す。
 * - HTTPS プロトコルを強制（localhost は HTTP を許可）
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
