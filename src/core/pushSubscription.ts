/**
 * Push Subscription 管理
 * Web Push API の登録/解除と Periodic Background Sync のフォールバックを提供する。
 */

/** Push サーバー URL をバリデーションする */
function validateServerUrl(serverUrl: string): string {
  const parsed = new URL(serverUrl);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error('Push サーバー URL は https: プロトコルが必要です');
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/** サーバーから VAPID 公開鍵を取得する */
async function fetchVapidPublicKey(serverUrl: string): Promise<string> {
  const url = validateServerUrl(serverUrl);
  const response = await fetch(`${url}/vapid-public-key`);
  if (!response.ok) {
    throw new Error(`VAPID 公開鍵の取得に失敗しました (${response.status})`);
  }
  const data = await response.json() as { publicKey: string };
  return data.publicKey;
}

/** Base64 URL エンコードされた文字列を Uint8Array に変換する */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Push Subscription を登録する。
 * 1. サーバーから VAPID 公開鍵を取得
 * 2. pushManager.subscribe() で購読
 * 3. サーバーに Subscription を登録
 */
export async function subscribePush(serverUrl: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;

  // 既存の Subscription を確認
  const existingSub = await registration.pushManager.getSubscription();
  if (existingSub) {
    // 既存 Subscription もサーバーに再登録して TTL を延長
    const url = validateServerUrl(serverUrl);
    await fetch(`${url}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: existingSub.toJSON() }),
    });
    return existingSub;
  }

  const validatedUrl = validateServerUrl(serverUrl);
  const publicKey = await fetchVapidPublicKey(serverUrl);
  const applicationServerKey = urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  // サーバーに Subscription を登録
  const response = await fetch(`${validatedUrl}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
    }),
  });

  if (!response.ok) {
    // 登録失敗時は Subscription を解除（解除失敗は無視して元のエラーを報告）
    try {
      await subscription.unsubscribe();
    } catch {
      // unsubscribe 失敗は無視
    }
    throw new Error(`サーバーへの Subscription 登録に失敗しました (${response.status})`);
  }

  return subscription;
}

/**
 * Push Subscription を解除する。
 * 1. サーバーから Subscription を削除
 * 2. pushManager.unsubscribe() でローカル解除
 */
export async function unsubscribePush(serverUrl: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return;

  // サーバーから Subscription を削除
  const url = validateServerUrl(serverUrl);
  try {
    await fetch(`${url}/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
      }),
    });
  } catch {
    // サーバー通信失敗は無視してローカル解除を続行
  }

  await subscription.unsubscribe();
}

/**
 * 現在の Push Subscription 状態を取得する。
 * @returns 購読中の Subscription、未購読なら null
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Periodic Background Sync を登録する（Chrome/Edge フォールバック）。
 * Push サーバー未設定時の代替手段。
 * @param minIntervalMs 最小間隔（ミリ秒）。ブラウザが実際の間隔を決定する。
 */
export async function registerPeriodicSync(minIntervalMs: number = 15 * 60_000): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;

    // Periodic Background Sync API の存在チェック
    if (!('periodicSync' in registration)) return false;

    // 権限チェック
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    if (status.state !== 'granted') return false;

    // 登録
    await (registration as ServiceWorkerRegistration & {
      periodicSync: { register: (tag: string, options: { minInterval: number }) => Promise<void> };
    }).periodicSync.register('heartbeat-periodic', {
      minInterval: minIntervalMs,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Periodic Background Sync を解除する。
 */
export async function unregisterPeriodicSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if (!('periodicSync' in registration)) return;

    await (registration as ServiceWorkerRegistration & {
      periodicSync: { unregister: (tag: string) => Promise<void> };
    }).periodicSync.unregister('heartbeat-periodic');
  } catch {
    // 解除失敗は無視
  }
}
