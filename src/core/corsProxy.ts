/**
 * CORS プロキシクライアント
 *
 * 外部リソースを CORS プロキシ経由で取得するユーティリティ。
 * ドメイン許可リストのクライアント側チェック + プロキシサーバーへのリクエストを行う。
 */

import { getConfig } from './config';
import type { ProxyConfig } from '../types';

export class CorsProxyError extends Error {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CorsProxyError';
    this.status = status;
  }
}

/** ドメインが許可リストに含まれるか判定（空リスト=全許可） */
export function isDomainAllowed(url: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  return allowedDomains.some((domain) => {
    const d = domain.toLowerCase().trim();
    const h = hostname.toLowerCase();
    // 完全一致 or サブドメイン一致
    return h === d || h.endsWith('.' + d);
  });
}

/** CORS プロキシ経由で外部リソースを取得する */
export async function fetchViaProxy(url: string, config?: ProxyConfig): Promise<Response> {
  const proxyConfig = config ?? getConfig().proxy;
  if (!proxyConfig) {
    throw new CorsProxyError('プロキシが設定されていません');
  }

  if (!proxyConfig.enabled) {
    throw new CorsProxyError('プロキシが無効です');
  }

  if (!proxyConfig.serverUrl) {
    throw new CorsProxyError('プロキシサーバー URL が設定されていません');
  }

  if (!proxyConfig.authToken) {
    throw new CorsProxyError('認証トークンが設定されていません');
  }

  // クライアント側のドメインチェック
  if (!isDomainAllowed(url, proxyConfig.allowedDomains)) {
    throw new CorsProxyError('このドメインは許可リストに含まれていません');
  }

  const proxyUrl = proxyConfig.serverUrl.replace(/\/+$/, '') + '/proxy';

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${proxyConfig.authToken}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    let errorMessage: string;
    try {
      const body = await response.json() as { error?: string };
      errorMessage = body.error ?? `プロキシエラー: ${response.status}`;
    } catch {
      errorMessage = `プロキシエラー: ${response.status}`;
    }
    throw new CorsProxyError(errorMessage, response.status);
  }

  return response;
}

/** /register エンドポイントでトークンを取得する */
export async function registerProxyToken(serverUrl: string, masterKey: string): Promise<string> {
  const registerUrl = serverUrl.replace(/\/+$/, '') + '/register';

  const response = await fetch(registerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${masterKey}`,
    },
  });

  if (!response.ok) {
    let errorMessage: string;
    try {
      const body = await response.json() as { error?: string };
      errorMessage = body.error ?? `登録エラー: ${response.status}`;
    } catch {
      errorMessage = `登録エラー: ${response.status}`;
    }
    throw new CorsProxyError(errorMessage, response.status);
  }

  const body = await response.json() as { token?: string };
  if (!body.token) {
    throw new CorsProxyError('トークンが返却されませんでした');
  }

  return body.token;
}
