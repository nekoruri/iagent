import { tool } from '@openai/agents';
import { z } from 'zod';
import { executeWorkerTool } from '../core/heartbeatTools';

/** Heartbeat Agent 用: fetchFeeds ツール */
export const hbFetchFeedsTool = tool({
  name: 'fetchFeeds',
  description: '購読中の全 RSS フィードの新着記事を取得します。',
  parameters: z.object({}),
  execute: async () => {
    return await executeWorkerTool('fetchFeeds', {});
  },
});

/** Heartbeat Agent 用: listUnreadFeedItems ツール */
export const hbListUnreadFeedItemsTool = tool({
  name: 'listUnreadFeedItems',
  description: '未読・未分類のフィード記事を title + excerpt で取得します（ページング対応）。offset=0, limit=30 がデフォルト。',
  parameters: z.object({
    offset: z.number().default(0).describe('取得開始位置（デフォルト 0）'),
    limit: z.number().default(30).describe('取得件数（デフォルト 30）'),
  }),
  execute: async ({ offset, limit }) => {
    return await executeWorkerTool('listUnreadFeedItems', { offset, limit });
  },
});

/** Heartbeat Agent 用: saveFeedClassification ツール */
export const hbSaveFeedClassificationTool = tool({
  name: 'saveFeedClassification',
  description: 'フィード記事の分類結果を保存します。',
  parameters: z.object({
    classifications: z.array(z.object({
      itemId: z.string().describe('記事 ID'),
      tier: z.enum(['must-read', 'recommended', 'skip']).describe('分類'),
    })).describe('分類結果の配列'),
  }),
  execute: async ({ classifications }) => {
    return await executeWorkerTool('saveFeedClassification', { classifications });
  },
});

/** Heartbeat Agent 用: listClassifiedFeedItems ツール */
export const hbListClassifiedFeedItemsTool = tool({
  name: 'listClassifiedFeedItems',
  description: '分類済み未読記事を取得します（must-read + recommended のみ、briefing 用）。tier=all で両方取得。',
  parameters: z.object({
    tier: z.enum(['must-read', 'recommended', 'all']).default('all').describe('分類でフィルタ。all で must-read + recommended の両方を取得。'),
  }),
  execute: async ({ tier }) => {
    // 'all' の場合は tier フィルタなし（must-read + recommended 両方）
    return await executeWorkerTool('listClassifiedFeedItems', { tier: tier === 'all' ? undefined : tier });
  },
});

/** Heartbeat Agent 用: listFeeds ツール */
export const hbListFeedsTool = tool({
  name: 'listFeeds',
  description: '購読中のフィード一覧を取得します。',
  parameters: z.object({}),
  execute: async () => {
    return await executeWorkerTool('listFeeds', {});
  },
});
