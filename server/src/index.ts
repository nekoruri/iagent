/**
 * iAgent Push Wake-up Server
 *
 * Cloudflare Workers + KV で Web Push のサブスクリプションを管理し、
 * Cron Trigger で定期的に wake-up push を全サブスクリプションに送信する。
 *
 * サーバーはユーザーデータを一切扱わない。
 * Push ペイロードは「今チェックして」というシグナルのみ。
 */

export interface Env {
  SUBSCRIPTIONS: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface SubscribeRequest {
  subscription: PushSubscriptionJSON;
}

// CORS ヘッダー
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function corsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// --- VAPID / Web Push 実装 (Web Crypto API ベース) ---

/** Base64URL エンコード */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64URL デコード */
function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** VAPID JWT トークンを生成する */
async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64: string,
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 3600, // 12時間有効
    sub: subject,
  };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // ECDSA P-256 秘密鍵をインポート
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  // 署名
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken),
  );

  // DER 署名を r||s 形式に変換
  const rawSignature = derToRaw(new Uint8Array(signature));
  const signatureB64 = base64UrlEncode(rawSignature);

  return `${unsignedToken}.${signatureB64}`;
}

/** DER エンコードされた ECDSA 署名を 64 バイトの raw (r||s) 形式に変換 */
function derToRaw(der: Uint8Array): ArrayBuffer {
  // DER 構造: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
  // Web Crypto は DER を返す場合があるので、raw に変換する
  if (der[0] !== 0x30) {
    // 既に raw 形式の可能性（64バイト）
    if (der.length === 64) return der.buffer;
    throw new Error('不正な署名形式');
  }

  let offset = 2;
  if (der[offset] !== 0x02) throw new Error('不正な DER 署名');
  offset++;
  const rLen = der[offset];
  offset++;
  const r = der.slice(offset, offset + rLen);
  offset += rLen;

  if (der[offset] !== 0x02) throw new Error('不正な DER 署名');
  offset++;
  const sLen = der[offset];
  offset++;
  const s = der.slice(offset, offset + sLen);

  // r と s をそれぞれ 32 バイトにパディング
  const raw = new Uint8Array(64);
  raw.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
  raw.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32));

  return raw.buffer;
}

/** Web Push メッセージを送信する */
async function sendWebPush(
  subscription: PushSubscriptionJSON,
  payload: string,
  env: Env,
): Promise<boolean> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await createVapidJwt(audience, env.VAPID_SUBJECT, env.VAPID_PRIVATE_KEY);

  // ペイロードの暗号化（aes128gcm）
  const encrypted = await encryptPayload(
    subscription.keys.p256dh,
    subscription.keys.auth,
    new TextEncoder().encode(payload),
  );

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '3600',
      'Urgency': 'normal',
    },
    body: encrypted,
  });

  if (response.status === 404 || response.status === 410) {
    // Subscription が無効 → 削除対象
    return false;
  }

  return response.ok;
}

/** Web Push ペイロードを aes128gcm で暗号化する */
async function encryptPayload(
  p256dhBase64: string,
  authBase64: string,
  plaintext: Uint8Array,
): Promise<ArrayBuffer> {
  // クライアントの公開鍵とauth secretをデコード
  const clientPublicKeyBytes = base64UrlDecode(p256dhBase64);
  const authSecret = base64UrlDecode(authBase64);

  // サーバー側の一時的な ECDH 鍵ペアを生成
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );

  // クライアントの公開鍵をインポート
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // ECDH 共有秘密を導出
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeyPair.privateKey,
    256,
  );

  // サーバー公開鍵をエクスポート
  const serverPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey),
  );

  // salt を生成
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK (Pseudo-Random Key) を導出
  // IKM = ECDH shared secret
  // auth_info = "WebPush: info\0" || client_public || server_public
  const authInfo = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\0'),
    ...clientPublicKeyBytes,
    ...serverPublicKeyBytes,
  ]);

  const prkKey = await crypto.subtle.importKey(
    'raw',
    authSecret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const ikm = new Uint8Array(
    await crypto.subtle.sign('HMAC', prkKey, new Uint8Array(sharedSecret)),
  );

  // HKDF で PRK を導出
  const prk = await hkdfExtract(salt, ikm);

  // CEK (Content Encryption Key) を導出
  const cekInfo = new Uint8Array([
    ...new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
  ]);
  const cek = await hkdfExpand(prk, cekInfo, 16);

  // Nonce を導出
  const nonceInfo = new Uint8Array([
    ...new TextEncoder().encode('Content-Encoding: nonce\0'),
  ]);
  const nonce = await hkdfExpand(prk, nonceInfo, 12);

  // パディング（1バイトのデリミタ + 0バイトのパディング）
  const paddedPlaintext = new Uint8Array(plaintext.length + 1);
  paddedPlaintext.set(plaintext);
  paddedPlaintext[plaintext.length] = 0x02; // レコードパディングデリミタ

  // AES-128-GCM で暗号化
  const encKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    encKey,
    paddedPlaintext,
  );

  // aes128gcm ヘッダーを構築
  // salt(16) || rs(4) || idlen(1) || keyid(65)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + serverPublicKeyBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = serverPublicKeyBytes.length;
  header.set(serverPublicKeyBytes, 21);

  // ヘッダー + 暗号文を結合
  const result = new Uint8Array(header.length + encrypted.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(encrypted), header.length);

  return result.buffer;
}

/** HKDF-Extract (HMAC-SHA-256) */
async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    salt,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
}

/** HKDF-Expand (HMAC-SHA-256) — 1 ブロックのみ（length <= 32） */
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    prk,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const input = new Uint8Array(info.length + 1);
  input.set(info, 0);
  input[info.length] = 0x01; // counter byte
  const output = new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
  return output.slice(0, length);
}

// --- ルーティング ---

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return corsResponse();
  }

  switch (url.pathname) {
    case '/vapid-public-key':
      return handleGetVapidPublicKey(env);

    case '/subscribe':
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      return handleSubscribe(request, env);

    case '/unsubscribe':
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      return handleUnsubscribe(request, env);

    case '/health':
      return jsonResponse({ status: 'ok' });

    default:
      return jsonResponse({ error: 'Not found' }, 404);
  }
}

function handleGetVapidPublicKey(env: Env): Response {
  return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY });
}

async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as SubscribeRequest;
  const { subscription } = body;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return jsonResponse({ error: '不正な Subscription データ' }, 400);
  }

  // endpoint をキーとして KV に保存
  const key = `sub:${encodeURIComponent(subscription.endpoint)}`;
  await env.SUBSCRIPTIONS.put(key, JSON.stringify(subscription), {
    expirationTtl: 30 * 24 * 3600, // 30日で自動削除
  });

  return jsonResponse({ ok: true });
}

async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as SubscribeRequest;
  const { subscription } = body;

  if (!subscription?.endpoint) {
    return jsonResponse({ error: '不正な Subscription データ' }, 400);
  }

  const key = `sub:${encodeURIComponent(subscription.endpoint)}`;
  await env.SUBSCRIPTIONS.delete(key);

  return jsonResponse({ ok: true });
}

// --- Cron Handler ---

async function handleCron(env: Env): Promise<void> {
  const payload = JSON.stringify({ type: 'heartbeat-wake' });
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'sub:' });

  const results = await Promise.allSettled(
    list.keys.map(async ({ name }) => {
      const data = await env.SUBSCRIPTIONS.get(name);
      if (!data) return;

      const subscription = JSON.parse(data) as PushSubscriptionJSON;
      const success = await sendWebPush(subscription, payload, env);

      if (!success) {
        // 無効な Subscription を削除
        await env.SUBSCRIPTIONS.delete(name);
      }
    }),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[Cron] ${failed.length}/${results.length} 件の push 送信に失敗`);
  }
}

// --- Worker エントリポイント ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env));
  },
};
