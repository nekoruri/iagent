import { computeSuggestionOptimizations, computeUserActivityPatterns, type UserActivityPatterns } from './heartbeatTools';
import { getHeartbeatFeedbackSummary, loadHeartbeatState, type FeedbackSummary } from '../store/heartbeatStore';
import { listMemories, listMemoryReevaluationCandidates } from '../store/memoryStore';
import type { Memory } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

export type LearningScopeState = 'active' | 'limited' | 'not-started';

export interface LearningScopeItem {
  id: 'timing' | 'task-frequency' | 'category-interest' | 'memory-quality' | 'wording-channel';
  label: string;
  state: LearningScopeState;
  detail: string;
}

export interface AutonomyLearningSummary {
  periodDays: number;
  totalResults: number;
  totalWithFeedback: number;
  overallAcceptRate: number;
  overallText: string;
  overallClassName: string;
  latestRuleSummary: string;
  latestRuleUpdatedAt?: number;
  latestRuleSource: 'memory' | 'computed' | 'none';
  reevaluationCandidateCount: number;
  items: LearningScopeItem[];
}

export interface BuildAutonomyLearningSummaryInput {
  periodDays: number;
  feedbackSummary: FeedbackSummary;
  patterns: UserActivityPatterns;
  latestOptimizationMemory: Memory | null;
  reevaluationCandidateCount: number;
}

function formatHours(hours: number[]): string {
  return hours.map((hour) => `${hour}時`).join(' / ');
}

function formatDays(days: number[]): string {
  return days.map((day) => DAY_NAMES[day] ?? `${day}`).join(' / ');
}

function summarizeRuleContent(content: string): string {
  const normalized = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 137)}...`;
}

export function buildAutonomyLearningSummary({
  periodDays,
  feedbackSummary,
  patterns,
  latestOptimizationMemory,
  reevaluationCandidateCount,
}: BuildAutonomyLearningSummaryInput): AutonomyLearningSummary {
  const optimization = computeSuggestionOptimizations(feedbackSummary, patterns, new Date());

  const hasFeedback = feedbackSummary.totalWithFeedback > 0;
  const hasEnoughFeedback = feedbackSummary.totalWithFeedback >= 5;

  const timingDetail = (() => {
    if (!hasFeedback) {
      return '時間帯 / 曜日の学習はまだ開始されていません。feedback 付き結果が必要です。';
    }

    const parts: string[] = [];
    if (patterns.bestHours.length > 0) {
      parts.push(`受容されやすい時間帯: ${formatHours(patterns.bestHours)}`);
    }
    if (patterns.bestDays.length > 0) {
      parts.push(`受容されやすい曜日: ${formatDays(patterns.bestDays)}`);
    }
    if (optimization.timingOptimization.suggestedQuietHours.length > 0) {
      parts.push(`静かにすべき候補時間帯: ${formatHours(optimization.timingOptimization.suggestedQuietHours)}`);
    }
    if (optimization.timingOptimization.suggestedQuietDays.length > 0) {
      parts.push(`静かにすべき候補曜日: ${formatDays(optimization.timingOptimization.suggestedQuietDays)}`);
    }

    return parts.length > 0
      ? parts.join('。')
      : '時間帯 / 曜日ごとの偏りはまだ明確ではありません。';
  })();

  const taskDetail = (() => {
    if (optimization.taskOptimizations.length === 0) {
      return 'タスク別の最適化ルールはまだ生成されていません。';
    }

    const counts = optimization.taskOptimizations.reduce(
      (acc, item) => {
        acc[item.adjustment]++;
        return acc;
      },
      {
        maintain: 0,
        improve: 0,
        'reduce-frequency': 0,
        'disable-candidate': 0,
      } as Record<string, number>,
    );

    return [
      `維持 ${counts.maintain}件`,
      `改善 ${counts.improve}件`,
      `頻度削減 ${counts['reduce-frequency']}件`,
      `無効化候補 ${counts['disable-candidate']}件`,
    ].join(' / ');
  })();

  const categoryDetail = (() => {
    if (optimization.categoryOptimizations.length === 0) {
      return '関心タグの変化を出せるだけの memory がまだありません。';
    }

    const rising = optimization.categoryOptimizations
      .filter((item) => item.trend === 'rising')
      .slice(0, 2)
      .map((item) => item.tag);
    const falling = optimization.categoryOptimizations
      .filter((item) => item.trend === 'falling')
      .slice(0, 2)
      .map((item) => item.tag);

    const parts: string[] = [];
    if (rising.length > 0) parts.push(`関心上昇: ${rising.join(' / ')}`);
    if (falling.length > 0) parts.push(`関心低下: ${falling.join(' / ')}`);
    return parts.length > 0
      ? parts.join('。')
      : 'タグの増減はありますが、強い偏りはまだ出ていません。';
  })();

  const memoryDetail = latestOptimizationMemory
    ? `再評価候補 ${reevaluationCandidateCount} 件。最新の最適化ルールは ${new Date(latestOptimizationMemory.updatedAt).toLocaleString()} に更新されています。`
    : `再評価候補 ${reevaluationCandidateCount} 件。memory 品質の見直しは suggestion optimization とは別系統で扱います。`;

  const items: LearningScopeItem[] = [
    {
      id: 'timing',
      label: 'timing',
      state: hasFeedback ? 'active' : 'not-started',
      detail: timingDetail,
    },
    {
      id: 'task-frequency',
      label: 'task frequency',
      state: optimization.taskOptimizations.length > 0 ? 'active' : hasFeedback ? 'limited' : 'not-started',
      detail: taskDetail,
    },
    {
      id: 'category-interest',
      label: 'category interest',
      state: optimization.categoryOptimizations.length > 0 ? 'active' : hasFeedback ? 'limited' : 'not-started',
      detail: categoryDetail,
    },
    {
      id: 'memory-quality',
      label: 'memory quality',
      state: latestOptimizationMemory || reevaluationCandidateCount > 0 ? 'active' : 'limited',
      detail: memoryDetail,
    },
    {
      id: 'wording-channel',
      label: 'wording / channel',
      state: 'limited',
      detail: '通知文面や channel の個別学習は未着手です。現状は timing / task / category / memory quality を主に扱います。',
    },
  ];

  const latestRuleSummary = latestOptimizationMemory
    ? summarizeRuleContent(latestOptimizationMemory.content)
    : hasFeedback
      ? optimization.actionableSummary
      : 'まだ最適化ルールは生成されていません。feedback が溜まると summary を出せます。';

  return {
    periodDays,
    totalResults: feedbackSummary.totalResults,
    totalWithFeedback: feedbackSummary.totalWithFeedback,
    overallAcceptRate: feedbackSummary.overallAcceptRate,
    overallText: hasEnoughFeedback ? '学習稼働中' : hasFeedback ? '学習データ蓄積中' : '学習データなし',
    overallClassName: hasEnoughFeedback ? 'mcp-status-connected' : hasFeedback ? 'mcp-status-warning' : 'mcp-status-disconnected',
    latestRuleSummary,
    latestRuleUpdatedAt: latestOptimizationMemory?.updatedAt,
    latestRuleSource: latestOptimizationMemory ? 'memory' : hasFeedback ? 'computed' : 'none',
    reevaluationCandidateCount,
    items,
  };
}

export async function loadAutonomyLearningSummary(periodDays = 14): Promise<AutonomyLearningSummary> {
  const normalizedPeriodDays = Math.max(1, Math.min(30, Math.floor(periodDays) || 14));
  const periodMs = normalizedPeriodDays * DAY_MS;
  const cutoff = Date.now() - periodMs;

  const [feedbackSummary, heartbeatState, memories, reevaluationCandidates] = await Promise.all([
    getHeartbeatFeedbackSummary(periodMs),
    loadHeartbeatState(),
    listMemories(),
    listMemoryReevaluationCandidates(),
  ]);

  const filteredResults = heartbeatState.recentResults.filter((result) => result.timestamp >= cutoff);
  const filteredMemories = memories.filter(
    (memory) => memory.createdAt >= cutoff && !memory.tags.includes('suggestion-optimization'),
  );
  const latestOptimizationMemory = memories
    .filter((memory) => memory.category === 'reflection' && memory.tags.includes('suggestion-optimization'))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  const patterns = computeUserActivityPatterns(filteredResults, filteredMemories, new Date());

  return buildAutonomyLearningSummary({
    periodDays: normalizedPeriodDays,
    feedbackSummary,
    patterns,
    latestOptimizationMemory,
    reevaluationCandidateCount: reevaluationCandidates.length,
  });
}
