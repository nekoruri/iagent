import { describe, expect, it } from 'vitest';
import { buildBudgetStatusSummary } from './autonomyBudgetStatus';

describe('autonomyBudgetStatus', () => {
  it('token budget が pressure 未満なら ok を返す', () => {
    const summary = buildBudgetStatusSummary({
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        tasks: [],
        desktopNotification: false,
        focusMode: false,
        costControl: {
          enabled: true,
          dailyTokenBudget: 1000,
          pressureThreshold: 0.8,
          deferNonCriticalTasks: true,
        },
      },
      tokensUsedToday: 200,
      latencyP95Ms: 1200,
      isOnline: true,
      storageInfo: { persistent: true, usage: 100, quota: 1000 },
      hasBackgroundPath: true,
    });

    expect(summary.items.find((item) => item.id === 'token')?.state).toBe('ok');
    expect(summary.items.find((item) => item.id === 'latency')?.state).toBe('ok');
    expect(summary.items.find((item) => item.id === 'storage')?.state).toBe('ok');
  });

  it('token budget 超過や offline では watch/limited を返す', () => {
    const summary = buildBudgetStatusSummary({
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        tasks: [],
        desktopNotification: false,
        focusMode: false,
        costControl: {
          enabled: true,
          dailyTokenBudget: 1000,
          pressureThreshold: 0.8,
          deferNonCriticalTasks: true,
        },
      },
      tokensUsedToday: 1100,
      latencyP95Ms: 50_000,
      isOnline: false,
      storageInfo: { persistent: false, usage: 970, quota: 1000 },
      hasBackgroundPath: false,
    });

    expect(summary.items.find((item) => item.id === 'token')?.state).toBe('limited');
    expect(summary.items.find((item) => item.id === 'latency')?.state).toBe('limited');
    expect(summary.items.find((item) => item.id === 'network')?.state).toBe('limited');
    expect(summary.items.find((item) => item.id === 'battery')?.state).toBe('watch');
  });
});
