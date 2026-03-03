import { tool } from '@openai/agents';
import { z } from 'zod';
import { executeWorkerTool } from '../core/heartbeatTools';

/** Heartbeat Agent 用: listCalendarEvents ツール */
export const hbListCalendarEventsTool = tool({
  name: 'listCalendarEvents',
  description: 'カレンダーのイベント一覧を取得します。日付を指定すると、その日のイベントのみ返します。',
  parameters: z.object({
    date: z.string().optional().describe('日付（YYYY-MM-DD 形式）。省略すると全イベントを返します。'),
  }),
  execute: async ({ date }) => {
    return await executeWorkerTool('listCalendarEvents', date ? { date } : {});
  },
});

/** Heartbeat Agent 用: getCurrentTime ツール */
export const hbGetCurrentTimeTool = tool({
  name: 'getCurrentTime',
  description: '現在の日時を日本語形式で返します。曜日情報も含みます。',
  parameters: z.object({}),
  execute: async () => {
    return await executeWorkerTool('getCurrentTime', {});
  },
});

/** Heartbeat Agent 用: checkMonitors ツール */
export const hbCheckMonitorsTool = tool({
  name: 'checkMonitors',
  description: '監視中の全 Web ページの変更をチェックします。',
  parameters: z.object({}),
  execute: async () => {
    return await executeWorkerTool('checkMonitors', {});
  },
});

/** Heartbeat Agent 用: getRecentMemoriesForReflection ツール */
export const hbGetRecentMemoriesForReflectionTool = tool({
  name: 'getRecentMemoriesForReflection',
  description: '直近24時間の記憶と、よく参照される記憶を取得します。',
  parameters: z.object({}),
  execute: async () => {
    return await executeWorkerTool('getRecentMemoriesForReflection', {});
  },
});

/** Heartbeat Agent 用: saveReflection ツール */
export const hbSaveReflectionTool = tool({
  name: 'saveReflection',
  description: 'ふりかえりの結果を reflection カテゴリの長期記憶として保存します。',
  parameters: z.object({
    content: z.string().describe('ふりかえりの内容'),
    tags: z.string().optional().describe('タグ（カンマ区切り）'),
    importance: z.number().optional().describe('重要度（1-5）'),
  }),
  execute: async ({ content, tags, importance }) => {
    const args: Record<string, unknown> = { content };
    if (tags !== undefined) args.tags = tags;
    if (importance !== undefined) args.importance = importance;
    return await executeWorkerTool('saveReflection', args);
  },
});

/** Heartbeat Agent 用: cleanupMemories ツール */
export const hbCleanupMemoriesTool = tool({
  name: 'cleanupMemories',
  description: '低スコアの記憶をアーカイブに移動します。',
  parameters: z.object({}),
  execute: async () => {
    return await executeWorkerTool('cleanupMemories', {});
  },
});

/** Heartbeat Agent 用: getHeartbeatFeedbackSummary ツール */
export const hbGetHeartbeatFeedbackSummaryTool = tool({
  name: 'getHeartbeatFeedbackSummary',
  description: '指定期間の Heartbeat 通知に対するユーザーフィードバックを集計します。',
  parameters: z.object({
    periodHours: z.number().int().min(1).max(168).optional().describe('集計対象の期間（時間単位、デフォルト 24、1〜168）'),
  }),
  execute: async ({ periodHours }) => {
    const args: Record<string, unknown> = {};
    if (periodHours !== undefined) args.periodHours = periodHours;
    return await executeWorkerTool('getHeartbeatFeedbackSummary', args);
  },
});

/** Heartbeat Agent 用: searchMemoriesByQuery ツール */
export const hbSearchMemoriesByQueryTool = tool({
  name: 'searchMemoriesByQuery',
  description: 'キーワードでユーザーの長期記憶を検索します。',
  parameters: z.object({
    query: z.string().describe('検索キーワード'),
    limit: z.number().optional().describe('取得件数（デフォルト 5、最大 20）'),
  }),
  execute: async ({ query, limit }) => {
    const args: Record<string, unknown> = { query };
    if (limit !== undefined) args.limit = limit;
    return await executeWorkerTool('searchMemoriesByQuery', args);
  },
});

/** Heartbeat Agent 用: getInfoThresholdStatus ツール */
export const hbGetInfoThresholdStatusTool = tool({
  name: 'getInfoThresholdStatus',
  description: '未分類フィード・未読分類済み記事・クリップの件数と閾値を返します。',
  parameters: z.object({}),
  execute: async () => {
    return await executeWorkerTool('getInfoThresholdStatus', {});
  },
});

/** Heartbeat Agent 用: getWeeklyReflections ツール */
export const hbGetWeeklyReflectionsTool = tool({
  name: 'getWeeklyReflections',
  description: '指定期間内の reflection カテゴリの記憶を取得します。',
  parameters: z.object({
    periodDays: z.number().int().min(1).max(30).optional().describe('取得期間（日数、デフォルト 7、1〜30）'),
  }),
  execute: async ({ periodDays }) => {
    const args: Record<string, unknown> = {};
    if (periodDays !== undefined) args.periodDays = periodDays;
    return await executeWorkerTool('getWeeklyReflections', args);
  },
});

/** Heartbeat Agent 用: getCrossSourceTopics ツール */
export const hbGetCrossSourceTopicsTool = tool({
  name: 'getCrossSourceTopics',
  description: 'RSS フィード記事とクリップを横断検索し、複数ソースで言及されている同一トピックを検出します。',
  parameters: z.object({
    periodDays: z.number().int().min(1).max(30).optional().describe('対象期間（日数、デフォルト 7、1〜30）'),
    query: z.string().optional().describe('キーワードフィルタ'),
  }),
  execute: async ({ periodDays, query }) => {
    const args: Record<string, unknown> = {};
    if (periodDays !== undefined) args.periodDays = periodDays;
    if (query !== undefined) args.query = query;
    return await executeWorkerTool('getCrossSourceTopics', args);
  },
});

/** Heartbeat Agent 用: getMonthlyGoalStats ツール */
export const hbGetMonthlyGoalStatsTool = tool({
  name: 'getMonthlyGoalStats',
  description: 'goal カテゴリの全メモリを集計し、月次レビュー用の統計を返します。',
  parameters: z.object({}),
  execute: async () => {
    return await executeWorkerTool('getMonthlyGoalStats', {});
  },
});

/** Heartbeat Agent 用: getUserActivityPatterns ツール */
export const hbGetUserActivityPatternsTool = tool({
  name: 'getUserActivityPatterns',
  description: 'Heartbeat 結果と記憶データからユーザーの行動パターンを分析します。',
  parameters: z.object({
    periodDays: z.number().int().min(1).max(30).optional().describe('分析対象期間（日数、デフォルト 14、1〜30）'),
  }),
  execute: async ({ periodDays }) => {
    const args: Record<string, unknown> = {};
    if (periodDays !== undefined) args.periodDays = periodDays;
    return await executeWorkerTool('getUserActivityPatterns', args);
  },
});

/** Heartbeat Agent 用: applyHeartbeatConfigAction ツール */
export const hbApplyHeartbeatConfigActionTool = tool({
  name: 'applyHeartbeatConfigAction',
  description: '分析結果に基づいて Heartbeat 設定を自動変更します。',
  parameters: z.object({
    actions: z.array(z.object({
      type: z.enum(['toggle-task', 'update-quiet-hours', 'update-quiet-days', 'update-task-interval']).describe('アクション型'),
      taskId: z.string().optional().describe('対象タスクID'),
      enabled: z.boolean().optional().describe('タスクの有効/無効'),
      quietHoursStart: z.number().optional().describe('静寂時間開始（0-23）'),
      quietHoursEnd: z.number().optional().describe('静寂時間終了（0-23）'),
      quietDays: z.array(z.number()).optional().describe('静寂曜日（0=日〜6=土）'),
      intervalMinutes: z.number().optional().describe('タスク間隔（分、5〜1440）'),
      reason: z.string().describe('変更理由'),
    })).describe('適用するアクションの配列'),
  }),
  execute: async ({ actions }) => {
    return await executeWorkerTool('applyHeartbeatConfigAction', { actions });
  },
});
