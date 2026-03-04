import type { HeartbeatResult } from '../types';
import { appendOpsEvent } from '../store/heartbeatStore';

/** ブラウザが Notification API をサポートしているか */
export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

/** 現在の通知権限を返す */
export function getNotificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/** 通知権限をリクエストする（ユーザーアクション起点で呼ぶこと） */
export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (!isNotificationSupported()) return 'denied';
  return Notification.requestPermission();
}

/** Heartbeat 結果からデスクトップ通知を送信する */
export function sendHeartbeatNotifications(results: HeartbeatResult[]): void {
  if (getNotificationPermission() !== 'granted') return;

  for (const result of results) {
    const source = result.source ?? 'tab';
    const notificationTag = `heartbeat-${result.taskId}-${result.timestamp}`;
    const notification = new Notification('iAgent Heartbeat', {
      body: result.summary,
      tag: notificationTag,
    });
    void appendOpsEvent({
      type: 'notification-shown',
      timestamp: Date.now(),
      source,
      channel: 'desktop',
      notificationTag,
      notificationId: notificationTag,
    }).catch(() => {});
    notification.onclick = () => {
      void appendOpsEvent({
        type: 'notification-clicked',
        timestamp: Date.now(),
        source,
        channel: 'desktop',
        notificationTag,
        notificationId: notificationTag,
      }).catch(() => {});
      window.focus();
      notification.close();
    };
  }
}
