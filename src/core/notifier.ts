import type { HeartbeatResult } from '../types';
import { createAutonomyEventMetadata, createAutonomyFlowId } from './autonomyEvent';
import { getSuppressionInterventionLevel } from './autonomyReason';
import { buildHeartbeatNotificationBody } from './heartbeatNotificationText';
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
  const permission = getNotificationPermission();
  if (permission !== 'granted') {
    const reason = permission === 'denied'
      ? 'notification_permission_denied'
      : permission === 'unsupported'
        ? 'notification_unsupported'
        : 'notification_permission_default';
    for (const result of results) {
      const source = result.source ?? 'tab';
      const flowId = result.flowId ?? createAutonomyFlowId(result.timestamp);
      void appendOpsEvent({
        ...createAutonomyEventMetadata({
          flowId,
          stage: 'delivery',
          interventionLevel: getSuppressionInterventionLevel(reason),
          contextSnapshotId: result.contextSnapshotId,
          nowTs: Date.now(),
        }),
        type: 'autonomy-stage',
        timestamp: Date.now(),
        source,
        reason,
      }).catch(() => {});
    }
    return;
  }

  for (const result of results) {
    const source = result.source ?? 'tab';
    const notificationTag = `heartbeat-${result.taskId}-${result.timestamp}`;
    const flowId = result.flowId ?? createAutonomyFlowId(result.timestamp);
    const notification = new Notification('iAgent Heartbeat', {
      body: buildHeartbeatNotificationBody([result]),
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: notificationTag,
    });
    void appendOpsEvent({
      ...createAutonomyEventMetadata({
        flowId,
        stage: 'delivery',
        interventionLevel: 'L3',
        contextSnapshotId: result.contextSnapshotId,
        nowTs: Date.now(),
      }),
      type: 'notification-shown',
      timestamp: Date.now(),
      source,
      channel: 'desktop',
      notificationTag,
      notificationId: notificationTag,
    }).catch(() => {});
    notification.onclick = () => {
      void appendOpsEvent({
        ...createAutonomyEventMetadata({
          flowId,
          stage: 'reaction',
          interventionLevel: 'L3',
          contextSnapshotId: result.contextSnapshotId,
          nowTs: Date.now(),
        }),
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
