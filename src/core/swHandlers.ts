/**
 * Service Worker イベントハンドラのロジック
 *
 * sw.ts から分離することでユニットテスト可能にしている。
 * SW 固有 API（showNotification, clients 等）はインターフェース経由で注入する。
 */

import { executeHeartbeatAndStore } from './heartbeatCommon';

// --- テスト可能にするための最小インターフェース定義 ---

/** 通知表示コンテキスト */
export interface SwNotifier {
  showNotification(title: string, options?: NotificationOptions): Promise<void>;
  getNotifications(filter?: { tag?: string }): Promise<Array<{ close(): void }>>;
}

/** クライアントウィンドウ操作コンテキスト */
export interface SwClients {
  matchAll(options?: { type?: string; includeUncontrolled?: boolean }): Promise<ReadonlyArray<{ url: string; focus?: () => Promise<unknown> }>>;
  openWindow(url: string): Promise<unknown>;
}

/** Push Subscription の最小インターフェース */
export interface SubscriptionLike {
  toJSON(): unknown;
}

// --- Push ハンドラ ---

export async function handlePush(
  data: { type?: string } | null | undefined,
  notifier: SwNotifier,
): Promise<void> {
  // heartbeat-wake 以外の push は無視（将来の拡張用）
  if (data?.type && data.type !== 'heartbeat-wake') return;

  try {
    // API キーは executeHeartbeatAndStore 内部で IndexedDB から取得
    const { results } = await executeHeartbeatAndStore('', 'push');

    if (results.length > 0) {
      const summaries = results.map((r) => r.summary).join('\n');
      await notifier.showNotification('iAgent Heartbeat [push]', {
        body: summaries,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'heartbeat-result',
        data: { url: '/' },
      });
    } else {
      // Chrome は push 受信時に通知表示が必須 — サイレント通知を出して即閉じ
      await notifier.showNotification('iAgent [push]', {
        body: '定期チェック完了（変化なし）',
        icon: '/pwa-192x192.png',
        tag: 'heartbeat-silent',
        silent: true,
      });
      // 少し待ってからサイレント通知を閉じる（通知表示の反映を待つ）
      await new Promise((resolve) => setTimeout(resolve, 100));
      const notifications = await notifier.getNotifications({ tag: 'heartbeat-silent' });
      for (const n of notifications) {
        n.close();
      }
    }
  } catch (error) {
    console.error('[SW] Heartbeat push エラー:', error);
    await notifier.showNotification('iAgent', {
      body: 'Heartbeat チェックでエラーが発生しました',
      icon: '/pwa-192x192.png',
      tag: 'heartbeat-error',
    });
  }
}

// --- Periodic Sync ハンドラ ---

export async function handlePeriodicSync(notifier: SwNotifier): Promise<void> {
  try {
    // API キーは IndexedDB から取得
    const { results } = await executeHeartbeatAndStore('', 'periodic-sync');

    if (results.length > 0) {
      const summaries = results.map((r) => r.summary).join('\n');
      await notifier.showNotification('iAgent Heartbeat [periodic-sync]', {
        body: summaries,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'heartbeat-result',
        data: { url: '/' },
      });
    }
  } catch (error) {
    console.error('[SW] Periodic sync エラー:', error);
  }
}

// --- PushSubscriptionChange ハンドラ ---

export async function handlePushSubscriptionChange(
  oldSubscription: SubscriptionLike | undefined,
  newSubscription: SubscriptionLike | undefined,
  subscribeFn: (applicationServerKey: ArrayBuffer) => Promise<SubscriptionLike>,
): Promise<void> {
  try {
    // IndexedDB から Push サーバー URL を取得
    const serverUrl = await getPushServerUrlFromIDB();
    if (!serverUrl) {
      console.warn('[SW] Push サーバー URL が設定されていないため、再登録をスキップ');
      return;
    }

    const url = serverUrl.replace(/\/+$/, '');

    // 旧 Subscription をサーバーから削除
    if (oldSubscription) {
      try {
        await fetch(`${url}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: oldSubscription.toJSON() }),
        });
      } catch {
        // 削除失敗は無視して再登録を続行
      }
    }

    // 新しい Subscription で再登録
    let sub = newSubscription;
    if (!sub) {
      // ブラウザが新 Subscription を提供しない場合は手動で再購読
      const vapidResponse = await fetch(`${url}/vapid-public-key`);
      if (!vapidResponse.ok) {
        throw new Error(`VAPID 公開鍵の取得に失敗 (${vapidResponse.status})`);
      }
      const { publicKey } = await vapidResponse.json() as { publicKey: string };
      const applicationServerKey = urlBase64ToUint8ArraySW(publicKey).buffer as ArrayBuffer;

      sub = await subscribeFn(applicationServerKey);
    }

    // サーバーに新 Subscription を登録
    const response = await fetch(`${url}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });

    if (!response.ok) {
      console.error('[SW] 新 Subscription のサーバー登録に失敗:', response.status);
    }
  } catch (error) {
    console.error('[SW] pushsubscriptionchange ハンドラエラー:', error);
  }
}

// --- 通知クリックハンドラ ---

export async function handleNotificationClick(
  notificationData: { url?: string } | undefined,
  origin: string,
  clients: SwClients,
): Promise<void> {
  const url = notificationData?.url ?? '/';
  const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

  // 既存タブがあればフォーカス
  for (const client of allClients) {
    if (new URL(client.url).origin === origin && client.focus) {
      await client.focus();
      return;
    }
  }
  // なければ新規タブを開く
  await clients.openWindow(url);
}

// --- ユーティリティ ---

/** IndexedDB から Push サーバー URL を取得する */
export async function getPushServerUrlFromIDB(): Promise<string | null> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('iagent-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = db.transaction('config', 'readonly');
    const store = tx.objectStore('config');
    const result = await new Promise<{ key: string; value: string } | undefined>((resolve) => {
      const req = store.get('app-config');
      req.onsuccess = () => resolve(req.result as { key: string; value: string } | undefined);
      req.onerror = () => resolve(undefined);
    });
    db.close();

    if (!result) return null;
    // configStore は { key: 'app-config', ...config } 形式で保存している
    const config = result as unknown as { key: string; push?: { serverUrl?: string } };
    return config.push?.serverUrl || null;
  } catch {
    return null;
  }
}

/** Base64 URL エンコードされた文字列を Uint8Array に変換する（SW 内用） */
export function urlBase64ToUint8ArraySW(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
