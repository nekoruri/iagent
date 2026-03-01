import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockExecuteWorkerTool = vi.fn();
vi.mock('../core/heartbeatTools', () => ({
  executeWorkerTool: (...args: unknown[]) => mockExecuteWorkerTool(...args),
}));

import {
  hbFetchFeedsTool,
  hbListUnreadFeedItemsTool,
  hbSaveFeedClassificationTool,
  hbListClassifiedFeedItemsTool,
  hbListFeedsTool,
} from './heartbeatFeedTools';

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteWorkerTool.mockResolvedValue(JSON.stringify({ success: true }));
});

describe('heartbeatFeedTools 定義', () => {
  it('各ツール名が正しく設定されている', () => {
    expect(hbFetchFeedsTool.name).toBe('fetchFeeds');
    expect(hbListUnreadFeedItemsTool.name).toBe('listUnreadFeedItems');
    expect(hbSaveFeedClassificationTool.name).toBe('saveFeedClassification');
    expect(hbListClassifiedFeedItemsTool.name).toBe('listClassifiedFeedItems');
    expect(hbListFeedsTool.name).toBe('listFeeds');
  });
});

describe('hbFetchFeedsTool', () => {
  it('executeWorkerTool("fetchFeeds", {}) を呼ぶ', async () => {
    await hbFetchFeedsTool.invoke({}, JSON.stringify({}));
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith('fetchFeeds', {});
  });

  it('executeWorkerTool の結果をそのまま返す', async () => {
    mockExecuteWorkerTool.mockResolvedValue(JSON.stringify({ fetched: 10 }));
    const result = await hbFetchFeedsTool.invoke({}, JSON.stringify({}));
    expect(JSON.parse(result)).toEqual({ fetched: 10 });
  });
});

describe('hbListUnreadFeedItemsTool', () => {
  it('デフォルト値で executeWorkerTool を呼ぶ', async () => {
    await hbListUnreadFeedItemsTool.invoke({}, JSON.stringify({ offset: 0, limit: 30 }));
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith('listUnreadFeedItems', { offset: 0, limit: 30 });
  });

  it('カスタム offset/limit を渡す', async () => {
    await hbListUnreadFeedItemsTool.invoke({}, JSON.stringify({ offset: 10, limit: 20 }));
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith('listUnreadFeedItems', { offset: 10, limit: 20 });
  });
});

describe('hbSaveFeedClassificationTool', () => {
  it('classifications 配列を渡す', async () => {
    const classifications = [
      { itemId: 'item-1', tier: 'must-read' },
      { itemId: 'item-2', tier: 'skip' },
    ];
    await hbSaveFeedClassificationTool.invoke({}, JSON.stringify({ classifications }));
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith('saveFeedClassification', { classifications });
  });
});

describe('hbListClassifiedFeedItemsTool', () => {
  it('tier="all" の場合は undefined に変換する', async () => {
    await hbListClassifiedFeedItemsTool.invoke({}, JSON.stringify({ tier: 'all' }));
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith('listClassifiedFeedItems', { tier: undefined });
  });

  it('tier="must-read" はそのまま渡す', async () => {
    await hbListClassifiedFeedItemsTool.invoke({}, JSON.stringify({ tier: 'must-read' }));
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith('listClassifiedFeedItems', { tier: 'must-read' });
  });

  it('tier="recommended" はそのまま渡す', async () => {
    await hbListClassifiedFeedItemsTool.invoke({}, JSON.stringify({ tier: 'recommended' }));
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith('listClassifiedFeedItems', { tier: 'recommended' });
  });
});

describe('hbListFeedsTool', () => {
  it('executeWorkerTool("listFeeds", {}) を呼ぶ', async () => {
    await hbListFeedsTool.invoke({}, JSON.stringify({}));
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith('listFeeds', {});
  });
});
