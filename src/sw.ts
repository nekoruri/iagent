/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { executeHeartbeatAndStore } from './core/heartbeatCommon';

declare const self: ServiceWorkerGlobalScope;

// Workbox precache（vite-plugin-pwa が自動注入するマニフェスト）
precacheAndRoute(self.__WB_MANIFEST);

// 即時アクティベーション
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// --- Layer 3: Push イベントハンドラ ---
self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event: PushEvent): Promise<void> {
  // Push データからメタ情報を取得（任意）
  let data: { type?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // JSON パース失敗は無視
  }

  // heartbeat-wake 以外の push は無視（将来の拡張用）
  if (data.type && data.type !== 'heartbeat-wake') return;

  try {
    // ソース識別子を渡す（API キーは executeHeartbeatAndStore 内部で IndexedDB から取得）
    const results = await executeHeartbeatAndStore('');

    if (results.length > 0) {
      const summaries = results.map((r) => r.summary).join('\n');
      await self.registration.showNotification('iAgent Heartbeat', {
        body: summaries,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'heartbeat-result',
        data: { url: '/' },
      });
    } else {
      // Chrome は push 受信時に通知表示が必須 — サイレント通知を出して即閉じ
      await self.registration.showNotification('iAgent', {
        body: '定期チェック完了（変化なし）',
        icon: '/pwa-192x192.png',
        tag: 'heartbeat-silent',
        silent: true,
      });
      // 少し待ってからサイレント通知を閉じる（通知表示の反映を待つ）
      await new Promise((resolve) => setTimeout(resolve, 100));
      const notifications = await self.registration.getNotifications({ tag: 'heartbeat-silent' });
      for (const n of notifications) {
        n.close();
      }
    }
  } catch (error) {
    console.error('[SW] Heartbeat push エラー:', error);
    await self.registration.showNotification('iAgent', {
      body: 'Heartbeat チェックでエラーが発生しました',
      icon: '/pwa-192x192.png',
      tag: 'heartbeat-error',
    });
  }
}

// --- Layer 3: Periodic Background Sync ハンドラ（フォールバック） ---
self.addEventListener('periodicsync', (event) => {
  // PeriodicSyncEvent の tag をチェック
  const syncEvent = event as ExtendableEvent & { tag: string };
  if (syncEvent.tag === 'heartbeat-periodic') {
    event.waitUntil(handlePeriodicSync());
  }
});

async function handlePeriodicSync(): Promise<void> {
  try {
    // ソース識別子を渡す（API キーは IndexedDB から取得）
    const results = await executeHeartbeatAndStore('');

    if (results.length > 0) {
      const summaries = results.map((r) => r.summary).join('\n');
      await self.registration.showNotification('iAgent Heartbeat', {
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

// --- pushsubscriptionchange ハンドラ（Subscription 失効時の自動再登録） ---
self.addEventListener('pushsubscriptionchange', (event) => {
  const changeEvent = event as ExtendableEvent & {
    oldSubscription?: PushSubscription;
    newSubscription?: PushSubscription;
  };
  event.waitUntil(handlePushSubscriptionChange(changeEvent));
});

async function handlePushSubscriptionChange(event: ExtendableEvent & {
  oldSubscription?: PushSubscription;
  newSubscription?: PushSubscription;
}): Promise<void> {
  try {
    // IndexedDB から Push サーバー URL を取得
    const serverUrl = await getPushServerUrlFromIDB();
    if (!serverUrl) {
      console.warn('[SW] Push サーバー URL が設定されていないため、再登録をスキップ');
      return;
    }

    const url = serverUrl.replace(/\/+$/, '');

    // 旧 Subscription をサーバーから削除
    if (event.oldSubscription) {
      try {
        await fetch(`${url}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: event.oldSubscription.toJSON() }),
        });
      } catch {
        // 削除失敗は無視して再登録を続行
      }
    }

    // 新しい Subscription で再登録
    let newSubscription = event.newSubscription;
    if (!newSubscription) {
      // ブラウザが新 Subscription を提供しない場合は手動で再購読
      const vapidResponse = await fetch(`${url}/vapid-public-key`);
      if (!vapidResponse.ok) {
        throw new Error(`VAPID 公開鍵の取得に失敗 (${vapidResponse.status})`);
      }
      const { publicKey } = await vapidResponse.json() as { publicKey: string };
      const applicationServerKey = urlBase64ToUint8ArraySW(publicKey).buffer as ArrayBuffer;

      newSubscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // サーバーに新 Subscription を登録
    const response = await fetch(`${url}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: newSubscription.toJSON() }),
    });

    if (!response.ok) {
      console.error('[SW] 新 Subscription のサーバー登録に失敗:', response.status);
    }
  } catch (error) {
    console.error('[SW] pushsubscriptionchange ハンドラエラー:', error);
  }
}

/** IndexedDB から Push サーバー URL を取得する */
async function getPushServerUrlFromIDB(): Promise<string | null> {
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
function urlBase64ToUint8ArraySW(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// --- 通知クリックハンドラ ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // 既存タブがあればフォーカス
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新規タブを開く
      return self.clients.openWindow(url);
    }),
  );
});
