/**
 * CORS プロキシハンドラ
 *
 * ブラウザの CORS 制限を回避するプロキシ機能。
 * 認証: マスターキーで /register → トークン自動生成 → Bearer トークンで /proxy 認証
 * セキュリティ: SSRF 防止 + レート制限 + レスポンスサイズ制限 + HTTPS 強制
 */

import type { Env } from './index';

// --- 定数 ---

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2MB
const REQUEST_TIMEOUT_MS = 15_000; // 15秒
const MAX_REDIRECTS = 5;
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX_REQUESTS = 30;
const TOKEN_TTL_SEC = 90 * 24 * 3600; // 90日

// 転送する安全なレスポンスヘッダー
const FORWARDED_HEADERS = ['content-type', 'last-modified', 'etag'];

// --- エラーレスポンス ---

function proxyError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- SSRF 防止: プライベート IP 検出 ---

/** IP アドレスがプライベートレンジかどうかを判定 */
export function isPrivateIP(hostname: string): boolean {
  // localhost
  if (hostname === 'localhost' || hostname === '[::1]') return true;

  // IPv4 プライベートレンジ
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
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

/** プロキシ先 URL のバリデーション */
export function validateProxyUrl(url: string): { valid: true; parsed: URL } | { valid: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'URL の形式が正しくありません' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'HTTPS プロトコルのみ許可されています' };
  }

  if (isPrivateIP(parsed.hostname)) {
    return { valid: false, error: 'プライベート IP へのアクセスは許可されていません' };
  }

  return { valid: true, parsed };
}

// --- レート制限 ---

/** KV ベースのレート制限チェック */
async function checkRateLimit(ip: string, kv: KVNamespace): Promise<boolean> {
  const key = `rate:${ip}`;
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // レート超過
  }

  await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
  return true;
}

// --- トークン認証 ---

/** Bearer トークンの検証 */
async function verifyToken(authHeader: string | null, kv: KVNamespace): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  if (!token) return false;
  const exists = await kv.get(`token:${token}`);
  return exists !== null;
}

/** Authorization ヘッダーからトークンを抽出 */
function extractToken(authHeader: string | null): string {
  if (!authHeader?.startsWith('Bearer ')) return '';
  return authHeader.slice(7);
}

// --- リダイレクト追跡付きフェッチ ---

/** リダイレクトを手動追跡し、各リダイレクト先も SSRF 検証する */
async function fetchWithRedirects(
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  let currentUrl = url;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const validation = validateProxyUrl(currentUrl);
    if (!validation.valid) {
      return proxyError(400, validation.error);
    }

    const resp = await fetch(currentUrl, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'iAgent-CORS-Proxy/1.0',
      },
    });

    // リダイレクトでない場合はレスポンスを返す
    if (resp.status < 300 || resp.status >= 400 || !resp.headers.get('location')) {
      return resp;
    }

    // リダイレクト先を解決
    const location = resp.headers.get('location')!;
    try {
      currentUrl = new URL(location, currentUrl).href;
    } catch {
      return proxyError(502, 'リダイレクト先の URL が不正です');
    }
  }

  return proxyError(502, 'リダイレクト回数が上限を超えました');
}

// --- ストリーミングサイズ制限読み取り ---

/** レスポンスボディをサイズ制限付きで読み取る */
async function readWithSizeLimit(response: Response): Promise<{ body: ArrayBuffer; size: number } | null> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { body: new ArrayBuffer(0), size: 0 };
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalSize += value.byteLength;
    if (totalSize > MAX_RESPONSE_SIZE) {
      reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  // チャンクを結合
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { body: result.buffer, size: totalSize };
}

// --- メインハンドラ ---

/** POST /register — トークン発行 */
export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const authHeader = request.headers.get('Authorization');

  // マスターキーで認証
  if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== env.PROXY_MASTER_KEY) {
    console.log(`[Register] ip=${ip} status=401`);
    return proxyError(401, '認証失敗');
  }

  // トークン生成
  const token = crypto.randomUUID();
  await env.RATE_LIMIT.put(`token:${token}`, '1', { expirationTtl: TOKEN_TTL_SEC });

  console.log(`[Register] ip=${ip} status=200`);
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** POST /proxy — CORS プロキシ */
export async function handleProxy(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const authHeader = request.headers.get('Authorization');
  const token = extractToken(authHeader);
  const tokenPrefix = token.slice(0, 8) || 'invalid';
  const startTime = Date.now();

  // トークン認証
  const isValidToken = await verifyToken(authHeader, env.RATE_LIMIT);
  if (!isValidToken) {
    console.log(`[Proxy] ip=${ip} token=${tokenPrefix}... status=401 error="認証失敗"`);
    return proxyError(401, '認証失敗');
  }

  // レート制限
  const allowed = await checkRateLimit(ip, env.RATE_LIMIT);
  if (!allowed) {
    console.log(`[Proxy] ip=${ip} token=${tokenPrefix}... status=429 error="レート制限超過"`);
    return proxyError(429, 'レート制限超過');
  }

  // リクエストボディをパース
  let body: { url?: string };
  try {
    body = await request.json() as { url?: string };
  } catch {
    return proxyError(400, '不正な JSON 形式');
  }

  const targetUrl = body.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return proxyError(400, 'url フィールドが必要です');
  }

  // URL バリデーション
  const validation = validateProxyUrl(targetUrl);
  if (!validation.valid) {
    console.log(`[Proxy] ip=${ip} token=${tokenPrefix}... url=${targetUrl} status=400 error="${validation.error}"`);
    return proxyError(400, validation.error);
  }

  // タイムアウト付きフェッチ
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetchWithRedirects(targetUrl, controller.signal);

    // fetchWithRedirects がエラーレスポンスを返した場合（SSRF 等）
    if (upstream.headers.get('Content-Type') === 'application/json' && upstream.status >= 400) {
      const elapsed = Date.now() - startTime;
      console.log(`[Proxy] ip=${ip} token=${tokenPrefix}... url=${targetUrl} status=${upstream.status} ms=${elapsed}`);
      return upstream;
    }

    // 上流エラー
    if (!upstream.ok) {
      const elapsed = Date.now() - startTime;
      console.log(`[Proxy] ip=${ip} token=${tokenPrefix}... url=${targetUrl} status=502 error="上流 ${upstream.status}" ms=${elapsed}`);
      return proxyError(502, `上流サーバーエラー: ${upstream.status}`);
    }

    // サイズ制限付きボディ読み取り
    const result = await readWithSizeLimit(upstream);
    if (!result) {
      const elapsed = Date.now() - startTime;
      console.log(`[Proxy] ip=${ip} token=${tokenPrefix}... url=${targetUrl} status=400 error="サイズ超過" ms=${elapsed}`);
      return proxyError(400, 'レスポンスサイズが 2MB を超えています');
    }

    // 安全なヘッダーのみ転送
    const responseHeaders = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Proxy] ip=${ip} token=${tokenPrefix}... url=${targetUrl} status=200 size=${result.size} ms=${elapsed}`);

    return new Response(result.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log(`[Proxy] ip=${ip} token=${tokenPrefix}... url=${targetUrl} status=504 error="タイムアウト" ms=${elapsed}`);
      return proxyError(504, 'リクエストがタイムアウトしました');
    }
    console.log(`[Proxy] ip=${ip} token=${tokenPrefix}... url=${targetUrl} status=502 error="${err instanceof Error ? err.message : String(err)}" ms=${elapsed}`);
    return proxyError(502, 'プロキシリクエストに失敗しました');
  } finally {
    clearTimeout(timeout);
  }
}
