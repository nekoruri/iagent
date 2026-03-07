import { getDeviceMode, getInstallState } from './contextSnapshot';
import { isStandaloneMode, isIOSSafari } from './installDetect';
import { getNotificationPermission } from './notifier';
import type { DeviceMode, InstallState } from '../types';

export type CapabilityLevel = 'yes' | 'conditional' | 'no' | 'unverified';
export type PeriodicSyncPermissionState = PermissionState | 'unsupported' | 'unknown';

export interface HeartbeatCapabilityItem {
  id:
    | 'foreground-heartbeat'
    | 'desktop-notification'
    | 'push-subscription'
    | 'background-wake-up'
    | 'periodic-sync';
  label: string;
  level: CapabilityLevel;
  detail: string;
}

export interface HeartbeatCapabilitySnapshot {
  environmentLabel: string;
  recommendedPath: string;
  items: HeartbeatCapabilityItem[];
}

export interface HeartbeatCapabilityBuildInput {
  notificationPermission: ReturnType<typeof getNotificationPermission>;
  heartbeatEnabled?: boolean;
  pushEnabled?: boolean;
  pushServerConfigured?: boolean;
  hasPushSubscription?: boolean;
  isIOSSafari?: boolean;
  isStandalone?: boolean;
  installState?: InstallState;
  deviceMode?: DeviceMode;
  serviceWorkerSupported?: boolean;
  pushManagerSupported?: boolean;
  periodicSyncSupported?: boolean;
  periodicSyncPermission?: PeriodicSyncPermissionState;
}

function getEnvironmentLabel(input: Required<Pick<
  HeartbeatCapabilityBuildInput,
  'isIOSSafari' | 'isStandalone' | 'deviceMode'
>>): string {
  if (input.isIOSSafari && input.isStandalone) return 'iOS Home Screen PWA';
  if (input.isIOSSafari) return 'iOS Safari';

  switch (input.deviceMode) {
    case 'desktop-pwa':
      return 'Desktop PWA';
    case 'mobile-pwa':
      return 'Mobile PWA';
    case 'mobile-browser':
      return 'Mobile browser';
    case 'desktop-browser':
      return 'Desktop browser';
    default:
      return 'Unknown environment';
  }
}

function getRecommendedPath(items: HeartbeatCapabilityItem[]): string {
  const pushItem = items.find((item) => item.id === 'push-subscription');
  const periodicItem = items.find((item) => item.id === 'periodic-sync');
  const backgroundItem = items.find((item) => item.id === 'background-wake-up');

  if (pushItem?.level === 'yes' && backgroundItem?.level === 'yes') {
    return 'Push + Service Worker';
  }
  if (pushItem?.level === 'conditional' || backgroundItem?.level === 'conditional') {
    return 'Push + Service Worker';
  }
  if (periodicItem?.level === 'yes' || periodicItem?.level === 'conditional') {
    return 'Foreground + Periodic Sync 補助';
  }
  return 'Foreground のみ';
}

export function buildHeartbeatCapabilitySnapshot(
  input: HeartbeatCapabilityBuildInput,
): HeartbeatCapabilitySnapshot {
  const isIosBrowser = Boolean(input.isIOSSafari && !input.isStandalone);
  const deviceMode = input.deviceMode ?? 'unknown';
  const environmentLabel = getEnvironmentLabel({
    isIOSSafari: Boolean(input.isIOSSafari),
    isStandalone: Boolean(input.isStandalone),
    deviceMode,
  });

  const foregroundItem: HeartbeatCapabilityItem = {
    id: 'foreground-heartbeat',
    label: 'タブ表示中の実行',
    level: 'yes',
    detail: input.heartbeatEnabled === false
      ? 'この環境では利用できます。現在は Heartbeat 設定が無効です。'
      : 'この環境では利用できます。アプリ表示中はメインスレッドで実行されます。',
  };

  const desktopNotificationItem: HeartbeatCapabilityItem = (() => {
    switch (input.notificationPermission) {
      case 'granted':
        return {
          id: 'desktop-notification',
          label: '通知表示',
          level: 'yes',
          detail: '通知権限が許可されているため、desktop notification を表示できます。',
        };
      case 'default':
        return {
          id: 'desktop-notification',
          label: '通知表示',
          level: 'conditional',
          detail: '通知権限を許可すると desktop notification を利用できます。',
        };
      case 'denied':
        return {
          id: 'desktop-notification',
          label: '通知表示',
          level: 'no',
          detail: '通知権限がブロックされているため、visible notification を出せません。',
        };
      default:
        return {
          id: 'desktop-notification',
          label: '通知表示',
          level: 'no',
          detail: 'このブラウザでは Notification API を利用できません。',
        };
    }
  })();

  const pushItem: HeartbeatCapabilityItem = (() => {
    if (isIosBrowser) {
      return {
        id: 'push-subscription',
        label: 'Push 購読',
        level: 'no',
        detail: 'iOS は通常ブラウザ状態では対象外です。ホーム画面に追加した PWA でのみ利用できます。',
      };
    }
    if (!input.serviceWorkerSupported || !input.pushManagerSupported) {
      return {
        id: 'push-subscription',
        label: 'Push 購読',
        level: 'no',
        detail: 'Service Worker または Push API が利用できないため、Push 購読は成立しません。',
      };
    }
    if (input.notificationPermission === 'denied' || input.notificationPermission === 'unsupported') {
      return {
        id: 'push-subscription',
        label: 'Push 購読',
        level: 'no',
        detail: '通知権限がないため、Push 購読を有効化できません。',
      };
    }
    if (input.notificationPermission !== 'granted') {
      return {
        id: 'push-subscription',
        label: 'Push 購読',
        level: 'conditional',
        detail: '通知権限を許可すると Push 購読を設定できます。',
      };
    }
    if (!input.pushServerConfigured) {
      return {
        id: 'push-subscription',
        label: 'Push 購読',
        level: 'conditional',
        detail: 'ブラウザ機能は利用可能です。Push サーバー URL を設定すると購読できます。',
      };
    }
    if (input.hasPushSubscription && input.pushEnabled) {
      return {
        id: 'push-subscription',
        label: 'Push 購読',
        level: 'yes',
        detail: 'Push 購読が成立しています。closed-state wake-up の第一経路として利用できます。',
      };
    }
    return {
      id: 'push-subscription',
      label: 'Push 購読',
      level: 'conditional',
      detail: 'ブラウザ機能は利用可能です。設定で Push を有効化すると購読できます。',
    };
  })();

  const periodicSyncItem: HeartbeatCapabilityItem = (() => {
    if (isIosBrowser) {
      return {
        id: 'periodic-sync',
        label: 'Periodic Sync 補助',
        level: 'no',
        detail: 'iOS Safari は current policy では Periodic Background Sync の対象外です。',
      };
    }
    if (!input.serviceWorkerSupported) {
      return {
        id: 'periodic-sync',
        label: 'Periodic Sync 補助',
        level: 'no',
        detail: 'Service Worker 非対応のため、Periodic Sync を利用できません。',
      };
    }
    if (!input.periodicSyncSupported) {
      return {
        id: 'periodic-sync',
        label: 'Periodic Sync 補助',
        level: 'no',
        detail: 'このブラウザでは Periodic Background Sync を利用できません。',
      };
    }
    if (input.periodicSyncPermission === 'denied') {
      return {
        id: 'periodic-sync',
        label: 'Periodic Sync 補助',
        level: 'no',
        detail: 'Periodic Background Sync 権限が拒否されているため、補助経路として使えません。',
      };
    }
    return {
      id: 'periodic-sync',
      label: 'Periodic Sync 補助',
      level: 'conditional',
      detail: '利用可能でも発火間隔はブラウザ裁量です。iAgent では Push の補助経路として扱います。',
    };
  })();

  const backgroundWakeItem: HeartbeatCapabilityItem = (() => {
    if (isIosBrowser) {
      return {
        id: 'background-wake-up',
        label: 'タブ閉鎖後の wake-up',
        level: 'no',
        detail: 'iOS 通常ブラウザ状態は background autonomy の対象外です。',
      };
    }
    if (pushItem.level === 'yes') {
      return {
        id: 'background-wake-up',
        label: 'タブ閉鎖後の wake-up',
        level: 'yes',
        detail: 'Push 購読が成立しているため、closed-state wake-up の第一経路が利用できます。',
      };
    }
    if (pushItem.level === 'conditional') {
      return {
        id: 'background-wake-up',
        label: 'タブ閉鎖後の wake-up',
        level: 'conditional',
        detail: 'Push が成立すれば closed-state wake-up を利用できます。',
      };
    }
    if (periodicSyncItem.level === 'conditional' || periodicSyncItem.level === 'yes') {
      return {
        id: 'background-wake-up',
        label: 'タブ閉鎖後の wake-up',
        level: 'conditional',
        detail: 'Push が使えない場合でも、Periodic Sync が補助経路になる可能性があります。',
      };
    }
    return {
      id: 'background-wake-up',
      label: 'タブ閉鎖後の wake-up',
      level: 'no',
      detail: 'closed-state wake-up を成立させる経路がありません。',
    };
  })();

  const items = [
    foregroundItem,
    desktopNotificationItem,
    pushItem,
    backgroundWakeItem,
    periodicSyncItem,
  ];

  return {
    environmentLabel,
    recommendedPath: getRecommendedPath(items),
    items,
  };
}

async function detectPeriodicSyncCapability(): Promise<{
  supported: boolean;
  permission: PeriodicSyncPermissionState;
}> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { supported: false, permission: 'unsupported' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if (!('periodicSync' in registration)) {
      return { supported: false, permission: 'unsupported' };
    }

    if (!navigator.permissions?.query) {
      return { supported: true, permission: 'unknown' };
    }

    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    return { supported: true, permission: status.state };
  } catch {
    return { supported: false, permission: 'unknown' };
  }
}

export async function loadHeartbeatCapabilitySnapshot(
  input: Partial<HeartbeatCapabilityBuildInput> = {},
): Promise<HeartbeatCapabilitySnapshot> {
  const installState = input.installState ?? getInstallState();
  const deviceMode = input.deviceMode ?? getDeviceMode({ installState });
  const periodicSyncCapability = typeof input.periodicSyncSupported === 'boolean'
    ? {
        supported: input.periodicSyncSupported,
        permission: input.periodicSyncPermission ?? 'unknown',
      }
    : await detectPeriodicSyncCapability();

  return buildHeartbeatCapabilitySnapshot({
    notificationPermission: input.notificationPermission ?? getNotificationPermission(),
    heartbeatEnabled: input.heartbeatEnabled,
    pushEnabled: input.pushEnabled,
    pushServerConfigured: input.pushServerConfigured,
    hasPushSubscription: input.hasPushSubscription,
    isIOSSafari: input.isIOSSafari ?? (typeof navigator !== 'undefined' ? isIOSSafari() : false),
    isStandalone: input.isStandalone ?? (typeof window !== 'undefined' ? isStandaloneMode() : false),
    installState,
    deviceMode,
    serviceWorkerSupported: input.serviceWorkerSupported ?? (typeof navigator !== 'undefined' && 'serviceWorker' in navigator),
    pushManagerSupported: input.pushManagerSupported ?? (typeof window !== 'undefined' && 'PushManager' in window),
    periodicSyncSupported: periodicSyncCapability.supported,
    periodicSyncPermission: periodicSyncCapability.permission,
  });
}
