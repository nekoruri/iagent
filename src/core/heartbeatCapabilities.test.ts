import { describe, expect, it } from 'vitest';
import { buildHeartbeatCapabilitySnapshot } from './heartbeatCapabilities';

describe('heartbeatCapabilities', () => {
  it('desktop browser で Push 購読済みなら Push 経路を利用可と判定する', () => {
    const snapshot = buildHeartbeatCapabilitySnapshot({
      notificationPermission: 'granted',
      heartbeatEnabled: true,
      pushEnabled: true,
      pushServerConfigured: true,
      hasPushSubscription: true,
      isIOSSafari: false,
      isStandalone: false,
      deviceMode: 'desktop-browser',
      serviceWorkerSupported: true,
      pushManagerSupported: true,
      periodicSyncSupported: false,
      periodicSyncPermission: 'unsupported',
    });

    expect(snapshot.environmentLabel).toBe('Desktop browser');
    expect(snapshot.recommendedPath).toBe('Push + Service Worker');
    expect(snapshot.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'push-subscription',
        level: 'yes',
      }),
      expect.objectContaining({
        id: 'background-wake-up',
        level: 'yes',
      }),
    ]));
  });

  it('iOS 通常ブラウザは foreground のみと判定する', () => {
    const snapshot = buildHeartbeatCapabilitySnapshot({
      notificationPermission: 'default',
      heartbeatEnabled: true,
      pushEnabled: false,
      pushServerConfigured: false,
      hasPushSubscription: false,
      isIOSSafari: true,
      isStandalone: false,
      deviceMode: 'mobile-browser',
      serviceWorkerSupported: true,
      pushManagerSupported: true,
      periodicSyncSupported: false,
      periodicSyncPermission: 'unsupported',
    });

    expect(snapshot.environmentLabel).toBe('iOS Safari');
    expect(snapshot.recommendedPath).toBe('Foreground のみ');
    expect(snapshot.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'push-subscription',
        level: 'no',
      }),
      expect.objectContaining({
        id: 'background-wake-up',
        level: 'no',
      }),
      expect.objectContaining({
        id: 'periodic-sync',
        level: 'no',
      }),
    ]));
  });

  it('Chromium PWA で Periodic Sync が使える場合は補助経路として扱う', () => {
    const snapshot = buildHeartbeatCapabilitySnapshot({
      notificationPermission: 'granted',
      heartbeatEnabled: true,
      pushEnabled: false,
      pushServerConfigured: true,
      hasPushSubscription: false,
      isIOSSafari: false,
      isStandalone: true,
      deviceMode: 'mobile-pwa',
      serviceWorkerSupported: true,
      pushManagerSupported: true,
      periodicSyncSupported: true,
      periodicSyncPermission: 'granted',
    });

    expect(snapshot.environmentLabel).toBe('Mobile PWA');
    expect(snapshot.recommendedPath).toBe('Push + Service Worker');
    expect(snapshot.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'push-subscription',
        level: 'conditional',
      }),
      expect.objectContaining({
        id: 'periodic-sync',
        level: 'conditional',
      }),
      expect.objectContaining({
        id: 'background-wake-up',
        level: 'conditional',
      }),
    ]));
  });
});
