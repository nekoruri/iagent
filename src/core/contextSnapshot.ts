import type {
  CalendarEvent,
  DeviceCalendarState,
  DeviceContextSnapshotV1,
  DeviceFocusState,
  DeviceMode,
  DeviceOnlineState,
  DeviceScene,
  DeviceTimeOfDay,
  InstallState,
} from '../types';

interface DeviceContextSnapshotInput {
  now?: Date;
  calendarEvents?: CalendarEvent[];
  isOnline?: boolean;
  focusMode?: boolean;
  isQuietPeriod?: boolean;
  installState?: InstallState;
  viewportWidth?: number;
}

interface DeviceSceneInput {
  timeOfDay: DeviceTimeOfDay;
  calendarState: DeviceCalendarState;
  onlineState: DeviceOnlineState;
  focusState: DeviceFocusState;
  deviceMode?: DeviceMode;
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseCalendarEventDateTime(event: CalendarEvent): Date | null {
  if (!event.date) return null;
  const raw = event.time ? `${event.date}T${event.time}` : `${event.date}T00:00`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getDeviceTimeOfDay(now = new Date()): DeviceTimeOfDay {
  const hour = now.getHours();
  if (hour >= 5 && hour <= 10) return 'morning';
  if (hour >= 11 && hour <= 17) return 'daytime';
  if (hour >= 18 && hour <= 22) return 'evening';
  return 'late-night';
}

export function getDeviceCalendarState(
  calendarEvents: CalendarEvent[] = [],
  now = new Date(),
): DeviceCalendarState {
  const todayKey = getLocalDateKey(now);
  const todayEvents = calendarEvents.filter((event) => event.date === todayKey);
  if (todayEvents.length === 0) return 'empty';

  const nowMs = now.getTime();
  for (const event of todayEvents) {
    const eventDate = parseCalendarEventDateTime(event);
    if (!eventDate) continue;
    const deltaMs = eventDate.getTime() - nowMs;
    if (deltaMs >= -15 * 60_000 && deltaMs <= 15 * 60_000) {
      return 'in-meeting-window';
    }
  }

  for (const event of todayEvents) {
    const eventDate = parseCalendarEventDateTime(event);
    if (!eventDate) continue;
    const deltaMs = eventDate.getTime() - nowMs;
    if (deltaMs > 0 && deltaMs <= 60 * 60_000) {
      return 'upcoming-soon';
    }
  }

  return 'busy-today';
}

export function getDeviceOnlineState(explicit?: boolean): DeviceOnlineState {
  if (typeof explicit === 'boolean') return explicit ? 'online' : 'offline';
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine ? 'online' : 'offline';
  }
  return 'unknown';
}

export function getDeviceFocusState(input: { focusMode?: boolean; isQuietPeriod?: boolean }): DeviceFocusState {
  if (input.focusMode) return 'focused';
  if (input.isQuietPeriod) return 'quiet-hours';
  return 'normal';
}

export function getInstallState(explicit?: InstallState): InstallState {
  if (explicit) return explicit;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unknown';
  const standalone = (navigator as { standalone?: boolean }).standalone === true;
  const displayMode = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
  return standalone || displayMode ? 'installed' : 'browser';
}

export function getDeviceMode(input: {
  installState?: InstallState;
  viewportWidth?: number;
}): DeviceMode {
  const installState = getInstallState(input.installState);
  const width = typeof input.viewportWidth === 'number'
    ? input.viewportWidth
    : typeof window !== 'undefined' && typeof window.innerWidth === 'number'
      ? window.innerWidth
      : undefined;
  const isMobile = typeof width === 'number'
    ? width <= 768
    : typeof navigator !== 'undefined'
      ? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      : false;

  if (installState === 'unknown' && typeof width !== 'number' && typeof navigator === 'undefined') {
    return 'unknown';
  }
  if (installState === 'installed') {
    return isMobile ? 'mobile-pwa' : 'desktop-pwa';
  }
  return isMobile ? 'mobile-browser' : 'desktop-browser';
}

export function getDeviceScene(input: DeviceSceneInput): DeviceScene {
  if (input.deviceMode === 'unknown') return 'general';
  if (input.onlineState === 'offline') return 'offline-recovery';
  if (input.focusState === 'focused') return 'focused-work';
  if (input.calendarState === 'upcoming-soon' || input.calendarState === 'in-meeting-window') {
    return 'pre-meeting';
  }
  if (input.timeOfDay === 'morning') return 'morning-briefing';
  if (input.timeOfDay === 'evening') return 'evening-review';
  if (input.timeOfDay === 'late-night') return 'late-night';
  return 'general';
}

export function createDeviceContextSnapshot(input: DeviceContextSnapshotInput = {}): DeviceContextSnapshotV1 {
  const now = input.now ?? new Date();
  const timeOfDay = getDeviceTimeOfDay(now);
  const calendarState = getDeviceCalendarState(input.calendarEvents ?? [], now);
  const onlineState = getDeviceOnlineState(input.isOnline);
  const focusState = getDeviceFocusState({
    focusMode: input.focusMode,
    isQuietPeriod: input.isQuietPeriod,
  });
  const deviceMode = getDeviceMode({
    installState: input.installState,
    viewportWidth: input.viewportWidth,
  });
  const installState = getInstallState(input.installState);
  return {
    capturedAt: now.getTime(),
    timeOfDay,
    calendarState,
    onlineState,
    focusState,
    deviceMode,
    installState,
    scene: getDeviceScene({
      timeOfDay,
      calendarState,
      onlineState,
      focusState,
      deviceMode,
    }),
  };
}
