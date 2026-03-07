import { describe, expect, it } from 'vitest';
import { buildAutonomyTrustStatus } from './autonomyTrustStatus';

describe('autonomyTrustStatus', () => {
  it('API キー未設定なら overall stopped を返す', () => {
    const summary = buildAutonomyTrustStatus({
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        tasks: [],
        desktopNotification: true,
        focusMode: false,
      },
      push: { enabled: false, serverUrl: '' },
      hasApiKey: false,
      notificationPermission: 'granted',
      hasPushSubscription: false,
      isQuietPeriod: false,
      capabilitySnapshot: null,
    });

    expect(summary.overallState).toBe('stopped');
    expect(summary.stopReasons).toContain('OpenAI API キー未設定');
  });

  it('フォーカスモード中は limited を返す', () => {
    const summary = buildAutonomyTrustStatus({
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        tasks: [],
        desktopNotification: true,
        focusMode: true,
      },
      push: { enabled: true, serverUrl: 'https://push.example.com' },
      hasApiKey: true,
      notificationPermission: 'granted',
      hasPushSubscription: true,
      isQuietPeriod: false,
      capabilitySnapshot: {
        environmentLabel: 'Desktop browser',
        recommendedPath: 'Push + Service Worker',
        items: [
          { id: 'background-wake-up', label: 'タブ閉鎖後の wake-up', level: 'yes', detail: 'Push 経路を利用できます。' },
        ],
      },
    });

    expect(summary.overallState).toBe('limited');
    expect(summary.items.find((item) => item.id === 'execution')?.state).toBe('limited');
    expect(summary.stopReasons).toContain('フォーカスモード');
  });

  it('Push 無効時は background を stopped として返す', () => {
    const summary = buildAutonomyTrustStatus({
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        tasks: [],
        desktopNotification: true,
        focusMode: false,
      },
      push: { enabled: false, serverUrl: '' },
      hasApiKey: true,
      notificationPermission: 'granted',
      hasPushSubscription: false,
      isQuietPeriod: false,
      capabilitySnapshot: null,
    });

    expect(summary.items.find((item) => item.id === 'background')?.state).toBe('stopped');
    expect(summary.stopReasons).toContain('バックグラウンド wake-up 無効');
  });
});
