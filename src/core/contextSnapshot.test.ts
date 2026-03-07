import { describe, expect, it, vi } from 'vitest';
import {
  createDeviceContextSnapshot,
  getDeviceCalendarState,
  getDeviceFocusState,
  getDeviceMode,
  getDeviceScene,
  getDeviceOnlineState,
  getDeviceTimeOfDay,
  getInstallState,
} from './contextSnapshot';

describe('contextSnapshot', () => {
  it('timeOfDay を時間帯で分類する', () => {
    expect(getDeviceTimeOfDay(new Date('2026-03-07T06:00:00'))).toBe('morning');
    expect(getDeviceTimeOfDay(new Date('2026-03-07T12:00:00'))).toBe('daytime');
    expect(getDeviceTimeOfDay(new Date('2026-03-07T19:00:00'))).toBe('evening');
    expect(getDeviceTimeOfDay(new Date('2026-03-07T01:00:00'))).toBe('late-night');
  });

  it('calendarState を予定状態で分類する', () => {
    const now = new Date('2026-03-07T09:00:00');
    expect(getDeviceCalendarState([], now)).toBe('empty');
    expect(getDeviceCalendarState([
      { id: 'e1', title: '会議', date: '2026-03-07', time: '09:10', createdAt: 1 },
    ], now)).toBe('in-meeting-window');
    expect(getDeviceCalendarState([
      { id: 'e2', title: '面談', date: '2026-03-07', time: '09:50', createdAt: 1 },
    ], now)).toBe('upcoming-soon');
    expect(getDeviceCalendarState([
      { id: 'e3', title: '夕方会議', date: '2026-03-07', time: '18:00', createdAt: 1 },
    ], now)).toBe('busy-today');
  });

  it('focusState を focusMode と quiet で分類する', () => {
    expect(getDeviceFocusState({ focusMode: true, isQuietPeriod: false })).toBe('focused');
    expect(getDeviceFocusState({ focusMode: false, isQuietPeriod: true })).toBe('quiet-hours');
    expect(getDeviceFocusState({ focusMode: false, isQuietPeriod: false })).toBe('normal');
  });

  it('installState と deviceMode を推定する', () => {
    expect(getInstallState('installed')).toBe('installed');
    expect(getDeviceMode({ installState: 'installed', viewportWidth: 390 })).toBe('mobile-pwa');
    expect(getDeviceMode({ installState: 'browser', viewportWidth: 1280 })).toBe('desktop-browser');
  });

  it('scene を coarse-grained に分類する', () => {
    expect(getDeviceScene({
      timeOfDay: 'morning',
      calendarState: 'empty',
      onlineState: 'online',
      focusState: 'normal',
    })).toBe('morning-briefing');
    expect(getDeviceScene({
      timeOfDay: 'daytime',
      calendarState: 'upcoming-soon',
      onlineState: 'online',
      focusState: 'normal',
    })).toBe('pre-meeting');
    expect(getDeviceScene({
      timeOfDay: 'daytime',
      calendarState: 'busy-today',
      onlineState: 'offline',
      focusState: 'normal',
    })).toBe('offline-recovery');
  });

  it('onlineState を明示値優先で分類する', () => {
    expect(getDeviceOnlineState(true)).toBe('online');
    expect(getDeviceOnlineState(false)).toBe('offline');
  });

  it('snapshot を最小入力から生成できる', () => {
    const snapshot = createDeviceContextSnapshot({
      now: new Date('2026-03-07T21:00:00'),
      calendarEvents: [{ id: 'e1', title: '夜会議', date: '2026-03-07', time: '22:00', createdAt: 1 }],
      focusMode: false,
      isQuietPeriod: false,
      isOnline: true,
      installState: 'browser',
      viewportWidth: 400,
    });

    expect(snapshot.timeOfDay).toBe('evening');
    expect(snapshot.calendarState).toBe('upcoming-soon');
    expect(snapshot.onlineState).toBe('online');
    expect(snapshot.focusState).toBe('normal');
    expect(snapshot.deviceMode).toBe('mobile-browser');
    expect(snapshot.installState).toBe('browser');
    expect(snapshot.scene).toBe('pre-meeting');
  });

  it('window / navigator がない環境では unknown にフォールバックする', () => {
    const windowSpy = vi.spyOn(globalThis, 'window', 'get').mockImplementation(() => undefined as never);
    const navigatorSpy = vi.spyOn(globalThis, 'navigator', 'get').mockImplementation(() => undefined as never);

    const snapshot = createDeviceContextSnapshot();

    expect(snapshot.onlineState).toBe('unknown');
    expect(snapshot.deviceMode).toBe('unknown');
    expect(snapshot.installState).toBe('unknown');
    expect(snapshot.scene).toBe('general');

    windowSpy.mockRestore();
    navigatorSpy.mockRestore();
  });
});
