import type { DeviceContextSnapshotV1, HeartbeatResult } from '../types';
import { sceneLabel } from './autonomyReason';

const IMPORTANT_NOTIFICATION_REASON_TASKS = new Set([
  'calendar-check',
  'briefing-morning',
  'feed-check',
  'rss-digest-daily',
  'reflection',
  'web-monitor-check',
]);

function timeOfDayLabel(timeOfDay: DeviceContextSnapshotV1['timeOfDay']): string {
  switch (timeOfDay) {
    case 'morning':
      return '朝';
    case 'daytime':
      return '日中';
    case 'evening':
      return '夕方';
    case 'late-night':
      return '深夜';
  }
}

function calendarStateLabel(calendarState: DeviceContextSnapshotV1['calendarState']): string | null {
  switch (calendarState) {
    case 'upcoming-soon':
      return '予定が近い';
    case 'in-meeting-window':
      return '会議時間帯';
    case 'busy-today':
      return '今日は予定あり';
    default:
      return null;
  }
}

function focusStateLabel(focusState: DeviceContextSnapshotV1['focusState']): string | null {
  switch (focusState) {
    case 'focused':
      return 'フォーカス中';
    case 'quiet-hours':
      return '静かな時間';
    default:
      return null;
  }
}

export function buildHeartbeatNotificationReason(
  contextSnapshot?: DeviceContextSnapshotV1,
): string | undefined {
  if (!contextSnapshot) return undefined;

  const parts = [
    sceneLabel(contextSnapshot.scene),
    timeOfDayLabel(contextSnapshot.timeOfDay),
    calendarStateLabel(contextSnapshot.calendarState),
    focusStateLabel(contextSnapshot.focusState),
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);

  return parts.length > 0 ? parts.slice(0, 2).join(' / ') : undefined;
}

export function shouldIncludeNotificationReason(taskId: string): boolean {
  return IMPORTANT_NOTIFICATION_REASON_TASKS.has(taskId);
}

export function buildHeartbeatNotificationBody(results: HeartbeatResult[]): string {
  const summaries = results
    .map((result) => result.summary.trim())
    .filter((summary) => summary.length > 0);
  const reason = results.find((result) => typeof result.notificationReason === 'string' && result.notificationReason.length > 0)?.notificationReason;

  if (summaries.length === 0) {
    return reason ?? '';
  }
  if (!reason) {
    return summaries.join('\n');
  }
  return `${summaries.join('\n')}\n${reason}`;
}
