import { describe, expect, it } from 'vitest';
import {
  buildHeartbeatNotificationBody,
  buildHeartbeatNotificationReason,
  shouldIncludeNotificationReason,
} from './heartbeatNotificationText';

describe('heartbeatNotificationText', () => {
  it('context snapshot から簡潔な通知理由を作る', () => {
    expect(buildHeartbeatNotificationReason({
      capturedAt: 1,
      timeOfDay: 'morning',
      calendarState: 'upcoming-soon',
      onlineState: 'online',
      focusState: 'normal',
      deviceMode: 'desktop-browser',
      installState: 'browser',
    })).toBe('朝 / 予定が近い');
  });

  it('通知本文に summary と理由を連結する', () => {
    expect(buildHeartbeatNotificationBody([
      {
        taskId: 'task-1',
        timestamp: 1,
        hasChanges: true,
        summary: '予定が近いです',
        notificationReason: '朝 / 予定が近い',
      },
    ])).toBe('予定が近いです\n朝 / 予定が近い');
  });

  it('重要タスクのみ通知理由を付ける', () => {
    expect(shouldIncludeNotificationReason('calendar-check')).toBe(true);
    expect(shouldIncludeNotificationReason('rss-digest-daily')).toBe(true);
    expect(shouldIncludeNotificationReason('reflection')).toBe(true);
    expect(shouldIncludeNotificationReason('weather-check')).toBe(false);
  });
});
