/**
 * VAPID キーペア生成スクリプト
 *
 * Usage:
 *   node scripts/generate-vapid.mjs
 *
 * 出力:
 *   VAPID_PUBLIC_KEY=<base64url エンコードされた公開鍵>
 *   VAPID_PRIVATE_KEY=<base64url エンコードされた PKCS8 秘密鍵>
 *
 * Cloudflare Workers への設定:
 *   wrangler secret put VAPID_PUBLIC_KEY
 *   wrangler secret put VAPID_PRIVATE_KEY
 *   wrangler secret put VAPID_SUBJECT   # (例: mailto:admin@example.com)
 */

import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function main() {
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  // 公開鍵を raw 形式（65バイト uncompressed point）でエクスポート
  const publicKeyRaw = await subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyB64 = base64UrlEncode(publicKeyRaw);

  // 秘密鍵を PKCS8 形式でエクスポート
  const privateKeyPkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyB64 = base64UrlEncode(privateKeyPkcs8);

  console.log('VAPID キーペアを生成しました:\n');
  console.log(`VAPID_PUBLIC_KEY=${publicKeyB64}`);
  console.log(`VAPID_PRIVATE_KEY=${privateKeyB64}`);
  console.log('\nCloudflare Workers に設定:');
  console.log('  wrangler secret put VAPID_PUBLIC_KEY');
  console.log('  wrangler secret put VAPID_PRIVATE_KEY');
  console.log('  wrangler secret put VAPID_SUBJECT   # 例: mailto:admin@example.com');
}

main().catch(console.error);
