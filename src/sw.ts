/// <reference lib="webworker" />

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import {
  handlePush,
  handlePeriodicSync,
  handlePushSubscriptionChange,
  handleNotificationClick,
} from './core/swHandlers';

declare const self: ServiceWorkerGlobalScope;

// Workbox precache（vite-plugin-pwa が自動注入するマニフェスト）
precacheAndRoute(self.__WB_MANIFEST);

// SPA アプリシェルパターン — ナビゲーションリクエストに precache 済みの index.html を返す
const navigationHandler = createHandlerBoundToURL('/index.html');
registerRoute(new NavigationRoute(navigationHandler));

// 即時アクティベーション
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 通知コンテキスト（SW API を swHandlers が要求するインターフェースに適合させる）
const notifier = {
  showNotification: (title: string, options?: NotificationOptions) =>
    self.registration.showNotification(title, options),
  getNotifications: (filter?: { tag?: string }) =>
    self.registration.getNotifications(filter),
};

// --- Layer 3: Push イベントハンドラ ---
self.addEventListener('push', (event) => {
  let data: { type?: string } | null = null;
  try {
    data = event.data?.json() ?? null;
  } catch {
    // JSON パース失敗は無視
  }
  event.waitUntil(handlePush(data, notifier, self.clients));
});

// --- Layer 3: Periodic Background Sync ハンドラ（フォールバック） ---
self.addEventListener('periodicsync', (event) => {
  // PeriodicSyncEvent の tag をチェック
  const syncEvent = event as ExtendableEvent & { tag: string };
  if (syncEvent.tag === 'heartbeat-periodic') {
    event.waitUntil(handlePeriodicSync(notifier, self.clients));
  }
});

// --- pushsubscriptionchange ハンドラ（Subscription 失効時の自動再登録） ---
self.addEventListener('pushsubscriptionchange', (event) => {
  const changeEvent = event as ExtendableEvent & {
    oldSubscription?: PushSubscription;
    newSubscription?: PushSubscription;
  };
  event.waitUntil(
    handlePushSubscriptionChange(
      changeEvent.oldSubscription,
      changeEvent.newSubscription,
      (applicationServerKey) =>
        self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }),
    ),
  );
});

// --- 通知クリックハンドラ ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    handleNotificationClick(
      event.notification.data as { url?: string; source?: 'push' | 'periodic-sync'; trackKpi?: boolean } | undefined,
      event.notification.tag,
      self.location.origin,
      self.clients,
    ),
  );
});
