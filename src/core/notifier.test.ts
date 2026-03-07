import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendHeartbeatNotifications,
} from './notifier';
import type { HeartbeatResult } from '../types';

const mockAppendOpsEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('../store/heartbeatStore', () => ({
  appendOpsEvent: (...args: unknown[]) => mockAppendOpsEvent(...args),
}));

describe('isNotificationSupported', () => {
  const originalNotification = globalThis.Notification;

  afterEach(() => {
    if (originalNotification) {
      Object.defineProperty(globalThis, 'Notification', {
        value: originalNotification,
        writable: true,
        configurable: true,
      });
    }
  });

  it('Notification が存在すれば true', () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: class MockNotification {
        static permission = 'default';
      },
      writable: true,
      configurable: true,
    });
    expect(isNotificationSupported()).toBe(true);
  });

  it('Notification が存在しなければ false', () => {
    // @ts-expect-error テスト用に undefined に設定
    delete globalThis.Notification;
    expect(isNotificationSupported()).toBe(false);
  });
});

describe('getNotificationPermission', () => {
  const originalNotification = globalThis.Notification;

  afterEach(() => {
    if (originalNotification) {
      Object.defineProperty(globalThis, 'Notification', {
        value: originalNotification,
        writable: true,
        configurable: true,
      });
    }
  });

  it('Notification がなければ unsupported を返す', () => {
    // @ts-expect-error テスト用に undefined に設定
    delete globalThis.Notification;
    expect(getNotificationPermission()).toBe('unsupported');
  });

  it('Notification.permission の値を返す', () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: class MockNotification {
        static permission = 'granted';
      },
      writable: true,
      configurable: true,
    });
    expect(getNotificationPermission()).toBe('granted');
  });
});

describe('requestNotificationPermission', () => {
  const originalNotification = globalThis.Notification;

  afterEach(() => {
    if (originalNotification) {
      Object.defineProperty(globalThis, 'Notification', {
        value: originalNotification,
        writable: true,
        configurable: true,
      });
    }
  });

  it('Notification がなければ denied を返す', async () => {
    // @ts-expect-error テスト用に undefined に設定
    delete globalThis.Notification;
    expect(await requestNotificationPermission()).toBe('denied');
  });

  it('requestPermission の結果を返す', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: Object.assign(
        class MockNotification {},
        {
          permission: 'default',
          requestPermission: vi.fn().mockResolvedValue('granted'),
        },
      ),
      writable: true,
      configurable: true,
    });
    expect(await requestNotificationPermission()).toBe('granted');
  });
});

describe('sendHeartbeatNotifications', () => {
  const originalNotification = globalThis.Notification;
  let mockInstances: Array<{ onclick: (() => void) | null; close: ReturnType<typeof vi.fn> }>;

  beforeEach(() => {
    mockAppendOpsEvent.mockClear();
    mockInstances = [];
    const MockNotification = vi.fn().mockImplementation(() => {
      const instance = { onclick: null, close: vi.fn() };
      mockInstances.push(instance);
      return instance;
    });
    MockNotification.permission = 'granted';
    MockNotification.requestPermission = vi.fn();

    Object.defineProperty(globalThis, 'Notification', {
      value: MockNotification,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalNotification) {
      Object.defineProperty(globalThis, 'Notification', {
        value: originalNotification,
        writable: true,
        configurable: true,
      });
    }
  });

  it('permission が granted のとき通知を作成する', () => {
    const results: HeartbeatResult[] = [
      { taskId: 'test-1', timestamp: 1000, hasChanges: true, summary: 'テスト通知', notificationReason: '朝 / 予定が近い' },
    ];
    sendHeartbeatNotifications(results);

    expect(Notification).toHaveBeenCalledWith('iAgent Heartbeat', {
      body: 'テスト通知\n朝 / 予定が近い',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'heartbeat-test-1-1000',
    });
    expect(mockAppendOpsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'notification-shown',
        notificationTag: 'heartbeat-test-1-1000',
        notificationId: 'heartbeat-test-1-1000',
      }),
    );
  });

  it('複数の結果に対して複数の通知を作成する', () => {
    const results: HeartbeatResult[] = [
      { taskId: 'test-1', timestamp: 1000, hasChanges: true, summary: '通知1' },
      { taskId: 'test-2', timestamp: 1000, hasChanges: true, summary: '通知2' },
    ];
    sendHeartbeatNotifications(results);

    expect(Notification).toHaveBeenCalledTimes(2);
  });

  it('permission が denied のとき通知を作成しない', () => {
    Object.defineProperty(Notification, 'permission', { value: 'denied', configurable: true });
    const results: HeartbeatResult[] = [
      { taskId: 'test-1', timestamp: 1000, hasChanges: true, summary: 'テスト' },
    ];
    sendHeartbeatNotifications(results);

    expect(mockInstances).toHaveLength(0);
  });

  it('onclick で window.focus を呼ぶ', () => {
    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});
    const results: HeartbeatResult[] = [
      { taskId: 'test-1', timestamp: 1000, hasChanges: true, summary: 'テスト' },
    ];
    sendHeartbeatNotifications(results);

    expect(mockInstances).toHaveLength(1);
    mockInstances[0].onclick?.();
    expect(focusSpy).toHaveBeenCalled();
    expect(mockInstances[0].close).toHaveBeenCalled();
    expect(mockAppendOpsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'notification-clicked',
        notificationTag: 'heartbeat-test-1-1000',
        notificationId: 'heartbeat-test-1-1000',
      }),
    );
    focusSpy.mockRestore();
  });
});
