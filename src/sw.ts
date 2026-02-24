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
      // 少し待ってからサイレント通知を閉じる
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

// --- 通知クリックハンドラ ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // 既存タブがあればフォーカス
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新規タブを開く
      return self.clients.openWindow(url);
    }),
  );
});
