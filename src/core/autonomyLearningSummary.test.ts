import { describe, expect, it } from 'vitest';
import { buildAutonomyLearningSummary } from './autonomyLearningSummary';
import type { FeedbackSummary } from '../store/heartbeatStore';
import type { UserActivityPatterns } from './heartbeatTools';
import type { Memory } from '../types';

function makeFeedbackSummary(overrides: Partial<FeedbackSummary> = {}): FeedbackSummary {
  return {
    periodMs: 14 * 24 * 60 * 60 * 1000,
    totalResults: 8,
    totalWithFeedback: 6,
    overallAcceptRate: 0.5,
    taskStats: [
      { taskId: 'calendar-check', accepted: 3, dismissed: 1, snoozed: 0, total: 4, acceptRate: 0.75 },
      { taskId: 'feed-check', accepted: 0, dismissed: 2, snoozed: 0, total: 2, acceptRate: 0 },
    ],
    ...overrides,
  };
}

function makePatterns(overrides: Partial<UserActivityPatterns> = {}): UserActivityPatterns {
  return {
    totalResults: 8,
    totalWithFeedback: 6,
    hourlyActivity: [
      { hour: 8, total: 3, accepted: 2, acceptRate: 2 / 3 },
      { hour: 22, total: 3, accepted: 0, acceptRate: 0 },
    ],
    dailyActivity: [
      { dayOfWeek: 1, dayName: '月曜日', totalResults: 3, accepted: 2, acceptRate: 2 / 3 },
      { dayOfWeek: 5, dayName: '金曜日', totalResults: 3, accepted: 0, acceptRate: 0 },
    ],
    taskTrends: [
      { taskId: 'calendar-check', recentAcceptRate: 0.8, previousAcceptRate: 0.4, trend: 'improving' },
      { taskId: 'feed-check', recentAcceptRate: 0, previousAcceptRate: 0.5, trend: 'declining' },
    ],
    topTags: [
      { tag: 'calendar', recentCount: 4, previousCount: 1, trend: 'rising' },
      { tag: 'rss', recentCount: 1, previousCount: 3, trend: 'falling' },
    ],
    bestHours: [8],
    bestDays: [1],
    ...overrides,
  };
}

function makeLatestRuleMemory(): Memory {
  return {
    id: 'memory-1',
    content: 'Accept率が高い朝のカレンダー系提案は維持し、夜の feed-check は頻度を下げる。',
    category: 'reflection',
    importance: 4,
    tags: ['suggestion-optimization', 'auto-tune'],
    createdAt: 1_000,
    updatedAt: 2_000,
    accessCount: 1,
    lastAccessedAt: 2_000,
    contentHash: 'hash',
  };
}

describe('buildAutonomyLearningSummary', () => {
  it('学習対象を summary として整形できる', () => {
    const summary = buildAutonomyLearningSummary({
      periodDays: 14,
      feedbackSummary: makeFeedbackSummary(),
      patterns: makePatterns(),
      latestOptimizationMemory: makeLatestRuleMemory(),
      reevaluationCandidateCount: 3,
    });

    expect(summary.overallText).toBe('学習稼働中');
    expect(summary.latestRuleSource).toBe('memory');
    expect(summary.latestRuleSummary).toContain('朝のカレンダー系提案');
    expect(summary.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'timing', state: 'active' }),
      expect.objectContaining({ id: 'task-frequency', state: 'active' }),
      expect.objectContaining({ id: 'category-interest', state: 'active' }),
      expect.objectContaining({ id: 'memory-quality', state: 'active' }),
      expect.objectContaining({ id: 'wording-channel', state: 'limited' }),
    ]));
  });

  it('feedback がない場合は未着手として返す', () => {
    const summary = buildAutonomyLearningSummary({
      periodDays: 14,
      feedbackSummary: makeFeedbackSummary({
        totalResults: 0,
        totalWithFeedback: 0,
        overallAcceptRate: 0,
        taskStats: [],
      }),
      patterns: makePatterns({
        totalResults: 0,
        totalWithFeedback: 0,
        hourlyActivity: [],
        dailyActivity: [],
        taskTrends: [],
        topTags: [],
        bestHours: [],
        bestDays: [],
      }),
      latestOptimizationMemory: null,
      reevaluationCandidateCount: 0,
    });

    expect(summary.overallText).toBe('学習データなし');
    expect(summary.latestRuleSource).toBe('none');
    expect(summary.latestRuleSummary).toContain('まだ最適化ルールは生成されていません');
    expect(summary.items.find((item) => item.id === 'timing')?.state).toBe('not-started');
    expect(summary.items.find((item) => item.id === 'task-frequency')?.state).toBe('not-started');
    expect(summary.items.find((item) => item.id === 'category-interest')?.state).toBe('not-started');
  });
});
