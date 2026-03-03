import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import {
  WORKER_TOOLS, executeWorkerTool,
  normalizeUrl, extractKeyTokens, countCommonTokens, groupByTopic,
  computeMonthlyGoalStats, computeUserActivityPatterns, computeSuggestionOptimizations,
  applyAction,
} from './heartbeatTools';
import type { ActionRequest } from './heartbeatTools';
import type { FeedbackSummary, TaskFeedbackStats } from '../store/heartbeatStore';
import type { UserActivityPatterns } from './heartbeatTools';
import type { UnifiedItem } from './heartbeatTools';
import type { HeartbeatConfig, HeartbeatResult, Memory } from '../types';
import { getDB } from '../store/db';
import { saveMemory } from '../store/memoryStore';
import { saveFeed, saveFeedItems } from '../store/feedStore';
import { addHeartbeatResult, setHeartbeatFeedback } from '../store/heartbeatStore';

beforeEach(() => {
  __resetStores();
});

describe('WORKER_TOOLS', () => {
  it('全 Worker ツールが定義されている', () => {
    expect(WORKER_TOOLS).toHaveLength(20);
    const names = WORKER_TOOLS.map((t) => t.function.name);
    expect(names).toContain('listCalendarEvents');
    expect(names).toContain('getCurrentTime');
    expect(names).toContain('fetchFeeds');
    expect(names).toContain('listFeeds');
    expect(names).toContain('checkMonitors');
    expect(names).toContain('getRecentMemoriesForReflection');
    expect(names).toContain('saveReflection');
    expect(names).toContain('cleanupMemories');
    expect(names).toContain('listUnreadFeedItems');
    expect(names).toContain('saveFeedClassification');
    expect(names).toContain('listClassifiedFeedItems');
    expect(names).toContain('searchMemoriesByQuery');
    expect(names).toContain('getHeartbeatFeedbackSummary');
    expect(names).toContain('getInfoThresholdStatus');
    expect(names).toContain('getWeeklyReflections');
    expect(names).toContain('getCrossSourceTopics');
    expect(names).toContain('getMonthlyGoalStats');
    expect(names).toContain('getUserActivityPatterns');
    expect(names).toContain('getSuggestionOptimizations');
    expect(names).toContain('applyHeartbeatConfigAction');
  });

  it('全ツールが function タイプである', () => {
    for (const tool of WORKER_TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeDefined();
      expect(tool.function.description).toBeDefined();
      expect(tool.function.parameters).toBeDefined();
    }
  });
});

describe('executeWorkerTool', () => {
  describe('listCalendarEvents', () => {
    it('イベントなしで空配列を返す', async () => {
      const result = await executeWorkerTool('listCalendarEvents', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.events).toEqual([]);
      expect(parsed.message).toBe('イベントはありません。');
    });

    it('全イベントを返す', async () => {
      const db = await getDB();
      await db.put('calendar', {
        id: '1', title: '会議', date: '2026-02-25', time: '10:00', createdAt: Date.now(),
      });
      await db.put('calendar', {
        id: '2', title: 'ランチ', date: '2026-02-26', time: '12:00', createdAt: Date.now(),
      });

      const result = await executeWorkerTool('listCalendarEvents', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.events).toHaveLength(2);
    });

    it('日付指定でフィルタする', async () => {
      const db = await getDB();
      await db.put('calendar', {
        id: '1', title: '会議', date: '2026-02-25', time: '10:00', createdAt: Date.now(),
      });
      await db.put('calendar', {
        id: '2', title: 'ランチ', date: '2026-02-26', time: '12:00', createdAt: Date.now(),
      });

      const result = await executeWorkerTool('listCalendarEvents', { date: '2026-02-25' });
      const parsed = JSON.parse(result.result);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].title).toBe('会議');
    });
  });

  describe('getCurrentTime', () => {
    it('現在時刻を返す', async () => {
      const result = await executeWorkerTool('getCurrentTime', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.currentTime).toBeDefined();
      expect(typeof parsed.currentTime).toBe('string');
    });
  });

  describe('getRecentMemoriesForReflection', () => {
    it('直近の記憶とアクセス上位を返す', async () => {
      await saveMemory('最近のメモリ', 'fact');
      await saveMemory('もう一つの記憶', 'preference');

      const result = await executeWorkerTool('getRecentMemoriesForReflection', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.recentCount).toBe(2);
      expect(parsed.topAccessedCount).toBe(2);
      expect(parsed.recent).toHaveLength(2);
      expect(parsed.topAccessed).toHaveLength(2);
    });

    it('記憶なしでも正常に動作する', async () => {
      const result = await executeWorkerTool('getRecentMemoriesForReflection', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.recentCount).toBe(0);
      expect(parsed.topAccessedCount).toBe(0);
    });
  });

  describe('saveReflection', () => {
    it('ふりかえりを reflection カテゴリで保存する', async () => {
      const result = await executeWorkerTool('saveReflection', {
        content: 'ユーザーは朝型で、午前中の作業効率が高い',
        importance: 4,
        tags: '洞察,パターン',
      });
      const parsed = JSON.parse(result.result);
      expect(parsed.message).toBe('ふりかえりを保存しました');
      expect(parsed.memory.category).toBe('reflection');
      expect(parsed.memory.importance).toBe(4);
      expect(parsed.memory.tags).toEqual(['洞察', 'パターン']);
    });

    it('content なしでエラーを返す', async () => {
      const result = await executeWorkerTool('saveReflection', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.error).toBe('content は必須です');
    });

    it('デフォルト importance は 3', async () => {
      const result = await executeWorkerTool('saveReflection', {
        content: 'シンプルな振り返り',
      });
      const parsed = JSON.parse(result.result);
      expect(parsed.memory.importance).toBe(3);
    });
  });

  describe('cleanupMemories', () => {
    it('低スコア記憶をアーカイブする', async () => {
      for (let i = 0; i < 10; i++) {
        await saveMemory(`メモリ ${i}`, 'other');
      }

      const result = await executeWorkerTool('cleanupMemories', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.archivedCount).toBe(5);
      expect(parsed.message).toContain('5 件');
    });

    it('記憶なしでもエラーにならない', async () => {
      const result = await executeWorkerTool('cleanupMemories', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.archivedCount).toBe(0);
    });
  });

  describe('listUnreadFeedItems', () => {
    it('未読未分類記事を excerpt 付きで返す', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'テストフィード' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Article 1', link: 'https://a.com/1', content: '<p>本文テキスト</p>', publishedAt: 1000 },
        { guid: 'g2', title: 'Article 2', link: 'https://a.com/2', content: 'シンプルテキスト', publishedAt: 2000 },
      ]);

      const result = await executeWorkerTool('listUnreadFeedItems', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.total).toBe(2);
      expect(parsed.items[0].feedTitle).toBe('テストフィード');
      expect(parsed.items[0].excerpt).toBe('シンプルテキスト');
      // HTML タグが除去されている
      expect(parsed.items[1].excerpt).toBe('本文テキスト');
    });

    it('excerpt が 100 文字に切り詰められる', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      const longContent = 'あ'.repeat(200);
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Long', link: 'https://a.com/1', content: longContent, publishedAt: 1000 },
      ]);

      const result = await executeWorkerTool('listUnreadFeedItems', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.items[0].excerpt).toHaveLength(100);
    });

    it('offset/limit の負数・極大値がクランプされる', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, Array.from({ length: 5 }, (_, i) => ({
        guid: `g${i}`, title: `Item ${i}`, link: `https://a.com/${i}`, content: '本文', publishedAt: i * 1000,
      })));

      // 負の offset → 0 にクランプ
      const r1 = await executeWorkerTool('listUnreadFeedItems', { offset: -5, limit: 10 });
      const p1 = JSON.parse(r1.result);
      expect(p1.items).toHaveLength(5);
      expect(p1.offset).toBe(0);

      // limit 200 → 100 にクランプ、limit 0 → 1 にクランプ
      const r2 = await executeWorkerTool('listUnreadFeedItems', { offset: 0, limit: 200 });
      const p2 = JSON.parse(r2.result);
      expect(p2.limit).toBe(100);

      const r3 = await executeWorkerTool('listUnreadFeedItems', { offset: 0, limit: 0 });
      const p3 = JSON.parse(r3.result);
      expect(p3.limit).toBe(1);
    });

    it('ページングが動作する', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, Array.from({ length: 5 }, (_, i) => ({
        guid: `g${i}`, title: `Item ${i}`, link: `https://a.com/${i}`, content: '本文', publishedAt: i * 1000,
      })));

      const result = await executeWorkerTool('listUnreadFeedItems', { offset: 0, limit: 2 });
      const parsed = JSON.parse(result.result);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.hasMore).toBe(true);
      expect(parsed.total).toBe(5);
    });
  });

  describe('saveFeedClassification', () => {
    it('分類結果を保存できる', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
        { guid: 'g2', title: 'Item 2', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
      ]);

      // アイテム ID を取得
      const db = await getDB();
      const items = await db.getAllFromIndex('feed-items', 'feedId', feed.id);

      const result = await executeWorkerTool('saveFeedClassification', {
        classifications: [
          { itemId: items[0].id, tier: 'must-read' },
          { itemId: items[1].id, tier: 'skip' },
        ],
      });
      const parsed = JSON.parse(result.result);
      expect(parsed.savedCount).toBe(2);
    });

    it('無効な tier は無視される', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      ]);

      const db = await getDB();
      const items = await db.getAllFromIndex('feed-items', 'feedId', feed.id);

      const result = await executeWorkerTool('saveFeedClassification', {
        classifications: [
          { itemId: items[0].id, tier: 'invalid-tier' },
        ],
      });
      const parsed = JSON.parse(result.result);
      expect(parsed.savedCount).toBe(0);
    });

    it('存在しない itemId はカウントされない', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Item 1', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
      ]);

      const db = await getDB();
      const items = await db.getAllFromIndex('feed-items', 'feedId', feed.id);

      const result = await executeWorkerTool('saveFeedClassification', {
        classifications: [
          { itemId: items[0].id, tier: 'must-read' },
          { itemId: 'non-existent-id', tier: 'recommended' },
        ],
      });
      const parsed = JSON.parse(result.result);
      expect(parsed.savedCount).toBe(1); // 存在する 1 件のみカウント
    });

    it('classifications なしでエラーを返す', async () => {
      const result = await executeWorkerTool('saveFeedClassification', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.error).toContain('classifications は必須です');
    });
  });

  describe('listClassifiedFeedItems', () => {
    it('must-read + recommended のみ返す', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'テストフィード' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Must', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
        { guid: 'g2', title: 'Rec', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
        { guid: 'g3', title: 'Skip', link: 'https://a.com/3', content: '本文', publishedAt: 3000 },
      ]);

      const db = await getDB();
      const items = await db.getAllFromIndex('feed-items', 'feedId', feed.id);
      const mustItem = items.find((i: { title: string }) => i.title === 'Must')!;
      const recItem = items.find((i: { title: string }) => i.title === 'Rec')!;
      const skipItem = items.find((i: { title: string }) => i.title === 'Skip')!;

      await executeWorkerTool('saveFeedClassification', {
        classifications: [
          { itemId: mustItem.id, tier: 'must-read' },
          { itemId: recItem.id, tier: 'recommended' },
          { itemId: skipItem.id, tier: 'skip' },
        ],
      });

      const result = await executeWorkerTool('listClassifiedFeedItems', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items.map((i: { title: string }) => i.title)).toContain('Must');
      expect(parsed.items.map((i: { title: string }) => i.title)).toContain('Rec');
      expect(parsed.items[0].feedTitle).toBe('テストフィード');
      expect(parsed.items[0].tier).toBeDefined();
    });

    it('tier=all で must-read + recommended を両方取得できる', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Must', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
        { guid: 'g2', title: 'Rec', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
      ]);

      const db = await getDB();
      const items = await db.getAllFromIndex('feed-items', 'feedId', feed.id);

      await executeWorkerTool('saveFeedClassification', {
        classifications: [
          { itemId: items[0].id, tier: 'must-read' },
          { itemId: items[1].id, tier: 'recommended' },
        ],
      });

      const result = await executeWorkerTool('listClassifiedFeedItems', { tier: 'all' });
      const parsed = JSON.parse(result.result);
      expect(parsed.items).toHaveLength(2);
    });

    it('tier フィルタで must-read のみ取得できる', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Must', link: 'https://a.com/1', content: '本文', publishedAt: 1000 },
        { guid: 'g2', title: 'Rec', link: 'https://a.com/2', content: '本文', publishedAt: 2000 },
      ]);

      const db = await getDB();
      const items = await db.getAllFromIndex('feed-items', 'feedId', feed.id);

      await executeWorkerTool('saveFeedClassification', {
        classifications: [
          { itemId: items[0].id, tier: 'must-read' },
          { itemId: items[1].id, tier: 'recommended' },
        ],
      });

      const result = await executeWorkerTool('listClassifiedFeedItems', { tier: 'must-read' });
      const parsed = JSON.parse(result.result);
      expect(parsed.items).toHaveLength(1);
    });
  });

  describe('getHeartbeatFeedbackSummary', () => {
    it('フィードバック統計を返す', async () => {
      const now = Date.now();
      await addHeartbeatResult({ taskId: 'task-a', timestamp: now - 1000, hasChanges: true, summary: 'A' });
      await setHeartbeatFeedback('task-a', now - 1000, 'accepted');
      await addHeartbeatResult({ taskId: 'task-b', timestamp: now - 2000, hasChanges: true, summary: 'B' });
      await setHeartbeatFeedback('task-b', now - 2000, 'dismissed');

      const result = await executeWorkerTool('getHeartbeatFeedbackSummary', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.periodHours).toBe(24);
      expect(parsed.totalResults).toBe(2);
      expect(parsed.totalWithFeedback).toBe(2);
      expect(parsed.overallAcceptRate).toBe(50); // 1/2 = 50%
      expect(parsed.taskStats).toHaveLength(2);
    });

    it('periodHours がクランプされる（1-168）', async () => {
      // 0 → 1 にクランプ
      const r1 = await executeWorkerTool('getHeartbeatFeedbackSummary', { periodHours: 0 });
      const p1 = JSON.parse(r1.result);
      expect(p1.periodHours).toBe(1);

      // 200 → 168 にクランプ
      const r2 = await executeWorkerTool('getHeartbeatFeedbackSummary', { periodHours: 200 });
      const p2 = JSON.parse(r2.result);
      expect(p2.periodHours).toBe(168);
    });

    it('結果なしで正常に動作する', async () => {
      const result = await executeWorkerTool('getHeartbeatFeedbackSummary', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.totalResults).toBe(0);
      expect(parsed.taskStats).toEqual([]);
    });
  });

  describe('searchMemoriesByQuery', () => {
    it('キーワードで関連記憶を返す', async () => {
      await saveMemory('A社の予算上限は年間500万', 'context');
      await saveMemory('B社のプロジェクト進行中', 'context');

      const result = await executeWorkerTool('searchMemoriesByQuery', { query: 'A社' });
      const parsed = JSON.parse(result.result);
      expect(parsed.count).toBeGreaterThan(0);
      expect(parsed.query).toBe('A社');
      expect(parsed.memories[0].content).toContain('A社');
    });

    it('空クエリでエラーを返す', async () => {
      const result = await executeWorkerTool('searchMemoriesByQuery', { query: '' });
      const parsed = JSON.parse(result.result);
      expect(parsed.error).toBe('query は必須です');
    });

    it('query 未指定でエラーを返す', async () => {
      const result = await executeWorkerTool('searchMemoriesByQuery', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.error).toBe('query は必須です');
    });

    it('limit がクランプされる（1-20）', async () => {
      for (let i = 0; i < 5; i++) {
        await saveMemory(`テスト記憶 ${i}`, 'fact');
      }

      // limit=2 で 2 件のみ
      const r1 = await executeWorkerTool('searchMemoriesByQuery', { query: 'テスト', limit: 2 });
      const p1 = JSON.parse(r1.result);
      expect(p1.count).toBeLessThanOrEqual(2);

      // limit=0 → 1 にクランプ
      const r2 = await executeWorkerTool('searchMemoriesByQuery', { query: 'テスト', limit: 0 });
      const p2 = JSON.parse(r2.result);
      expect(p2.count).toBeLessThanOrEqual(1);

      // limit=100 → 20 にクランプ
      const r3 = await executeWorkerTool('searchMemoriesByQuery', { query: 'テスト', limit: 100 });
      const p3 = JSON.parse(r3.result);
      expect(p3.count).toBeLessThanOrEqual(20);
    });

    it('記憶なしでも正常に動作する', async () => {
      const result = await executeWorkerTool('searchMemoriesByQuery', { query: '存在しないキーワード' });
      const parsed = JSON.parse(result.result);
      expect(parsed.count).toBe(0);
      expect(parsed.memories).toEqual([]);
    });
  });

  describe('getInfoThresholdStatus', () => {
    it('データなしで全カウント 0、exceeded=false', async () => {
      const result = await executeWorkerTool('getInfoThresholdStatus', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.unclassifiedFeedCount).toBe(0);
      expect(parsed.unreadClassifiedCount).toBe(0);
      expect(parsed.totalClipCount).toBe(0);
      expect(parsed.exceeded).toBe(false);
      expect(parsed.thresholds).toEqual({ unclassifiedFeed: 50, unreadClassified: 30, clips: 100 });
    });

    it('未分類フィード 51 件で exceeded=true', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, Array.from({ length: 51 }, (_, i) => ({
        guid: `g${i}`, title: `Item ${i}`, link: `https://a.com/${i}`, content: '本文', publishedAt: i * 1000,
      })));

      const result = await executeWorkerTool('getInfoThresholdStatus', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.unclassifiedFeedCount).toBe(51);
      expect(parsed.exceeded).toBe(true);
      expect(parsed.details.unclassifiedFeedExceeded).toBe(true);
    });

    it('閾値ちょうど（50 件）で exceeded=false', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, Array.from({ length: 50 }, (_, i) => ({
        guid: `g${i}`, title: `Item ${i}`, link: `https://a.com/${i}`, content: '本文', publishedAt: i * 1000,
      })));

      const result = await executeWorkerTool('getInfoThresholdStatus', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.unclassifiedFeedCount).toBe(50);
      expect(parsed.exceeded).toBe(false);
      expect(parsed.details.unclassifiedFeedExceeded).toBe(false);
    });

    it('クリップ 101 件で exceeded=true', async () => {
      const db = await getDB();
      for (let i = 0; i < 101; i++) {
        await db.put('clips', {
          id: `clip-${i}`,
          url: `https://example.com/${i}`,
          title: `Clip ${i}`,
          content: `内容 ${i}`,
          tags: [],
          createdAt: Date.now() - i * 1000,
        });
      }

      const result = await executeWorkerTool('getInfoThresholdStatus', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.totalClipCount).toBe(101);
      expect(parsed.exceeded).toBe(true);
      expect(parsed.details.clipsExceeded).toBe(true);
    });
  });

  describe('getWeeklyReflections', () => {
    it('直近 7 日の reflection のみ返す（fact カテゴリは除外）', async () => {
      await saveMemory('今日のふりかえり', 'reflection', { importance: 3, tags: ['daily-summary'] });
      await saveMemory('事実メモ', 'fact');

      const result = await executeWorkerTool('getWeeklyReflections', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.count).toBe(1);
      expect(parsed.reflections[0].content).toBe('今日のふりかえり');
    });

    it('デフォルト periodDays=7', async () => {
      const result = await executeWorkerTool('getWeeklyReflections', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.periodDays).toBe(7);
    });

    it('periodDays がクランプされる（0→1、60→30）', async () => {
      const r1 = await executeWorkerTool('getWeeklyReflections', { periodDays: 0 });
      const p1 = JSON.parse(r1.result);
      expect(p1.periodDays).toBe(1);

      const r2 = await executeWorkerTool('getWeeklyReflections', { periodDays: 60 });
      const p2 = JSON.parse(r2.result);
      expect(p2.periodDays).toBe(30);
    });

    it('reflection なしで空配列', async () => {
      const result = await executeWorkerTool('getWeeklyReflections', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.reflections).toEqual([]);
      expect(parsed.count).toBe(0);
    });

    it('期間外の reflection は除外', async () => {
      // 直近の reflection を作成
      await saveMemory('今日のふりかえり', 'reflection');

      // 期間外の reflection を IDB 直接投入
      const db = await getDB();
      const oldDate = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10日前
      await db.put('memories', {
        id: 'old-reflection',
        content: '古いふりかえり',
        category: 'reflection',
        importance: 3,
        tags: [],
        accessCount: 0,
        lastAccessedAt: oldDate,
        contentHash: 'dummy-hash',
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      const result = await executeWorkerTool('getWeeklyReflections', { periodDays: 7 });
      const parsed = JSON.parse(result.result);
      expect(parsed.count).toBe(1);
      expect(parsed.reflections[0].content).toBe('今日のふりかえり');
    });
  });

  describe('getCrossSourceTopics', () => {
    it('URL 重複でグループ化（feed + clip 同一 URL → sourceCount=2）', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'フィードA' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Bun 1.2 リリース', link: 'https://example.com/bun-1.2', content: '本文', publishedAt: Date.now() - 1000 },
      ]);
      // 同一 URL のクリップ
      const db = await getDB();
      await db.put('clips', {
        id: 'clip-1',
        url: 'https://example.com/bun-1.2',
        title: 'Bun 1.2 がリリースされた',
        content: 'クリップ内容',
        tags: [],
        createdAt: Date.now() - 2000,
      });

      const result = await executeWorkerTool('getCrossSourceTopics', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.totalTopics).toBe(1);
      expect(parsed.topics[0].sourceCount).toBe(2);
      expect(parsed.topics[0].items).toHaveLength(2);
    });

    it('タイトル類似でグループ化（異なる URL、共通キーワード → 同一トピック）', async () => {
      const feedA = await saveFeed({ url: 'https://a.com/feed', title: 'フィードA' });
      const feedB = await saveFeed({ url: 'https://b.com/feed', title: 'フィードB' });
      await saveFeedItems(feedA.id, [
        { guid: 'g1', title: 'Bun 1.2 パフォーマンス改善のリリース', link: 'https://a.com/bun', content: '本文', publishedAt: Date.now() - 1000 },
      ]);
      await saveFeedItems(feedB.id, [
        { guid: 'g2', title: 'Bun 1.2 リリースとパフォーマンスの比較', link: 'https://b.com/bun', content: '本文', publishedAt: Date.now() - 2000 },
      ]);

      const result = await executeWorkerTool('getCrossSourceTopics', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.totalTopics).toBe(1);
      expect(parsed.topics[0].sourceCount).toBe(2);
    });

    it('単一ソースはトピックに含まれない（sourceCount < 2 除外）', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'フィードA' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'React 19 新機能', link: 'https://a.com/react', content: '本文', publishedAt: Date.now() - 1000 },
      ]);

      const result = await executeWorkerTool('getCrossSourceTopics', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.totalTopics).toBe(0);
      expect(parsed.topics).toEqual([]);
    });

    it('periodDays クランプ（0→1、60→30）', async () => {
      const r1 = await executeWorkerTool('getCrossSourceTopics', { periodDays: 0 });
      const p1 = JSON.parse(r1.result);
      expect(p1.periodDays).toBe(1);

      const r2 = await executeWorkerTool('getCrossSourceTopics', { periodDays: 60 });
      const p2 = JSON.parse(r2.result);
      expect(p2.periodDays).toBe(30);
    });

    it('期間外データ除外（40日前 → 7日フィルタで 0 件）', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'フィードA' });
      const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Old Article', link: 'https://a.com/old', content: '本文', publishedAt: old },
      ]);
      const db = await getDB();
      await db.put('clips', {
        id: 'clip-old',
        url: 'https://a.com/old',
        title: 'Old Clip',
        content: '古いクリップ',
        tags: [],
        createdAt: old,
      });

      const result = await executeWorkerTool('getCrossSourceTopics', { periodDays: 7 });
      const parsed = JSON.parse(result.result);
      expect(parsed.totalTopics).toBe(0);
    });

    it('query フィルタ動作', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'フィードA' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Bun 1.2 リリース', link: 'https://a.com/bun', content: 'Bun の話題', publishedAt: Date.now() - 1000 },
        { guid: 'g2', title: 'React 19 新機能', link: 'https://a.com/react', content: 'React の話題', publishedAt: Date.now() - 2000 },
      ]);
      const db = await getDB();
      await db.put('clips', {
        id: 'clip-bun',
        url: 'https://b.com/bun',
        title: 'Bun 1.2 テスト',
        content: 'Bun 関連',
        tags: [],
        createdAt: Date.now() - 3000,
      });

      const result = await executeWorkerTool('getCrossSourceTopics', { query: 'Bun' });
      const parsed = JSON.parse(result.result);
      // Bun 関連のみ（feed + clip → sourceCount=2）
      expect(parsed.totalTopics).toBeGreaterThanOrEqual(1);
      for (const topic of parsed.topics) {
        const hasBun = topic.items.some((i: { title: string }) => i.title.toLowerCase().includes('bun'));
        expect(hasBun).toBe(true);
      }
    });

    it('skip 分類のフィード記事は除外', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'フィードA' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'Skip Article', link: 'https://a.com/skip', content: '本文', publishedAt: Date.now() - 1000 },
      ]);
      // tier=skip を設定
      const db = await getDB();
      const items = await db.getAllFromIndex('feed-items', 'feedId', feed.id);
      await db.put('feed-items', { ...items[0], tier: 'skip' as const });
      // 同一 URL のクリップ
      await db.put('clips', {
        id: 'clip-skip',
        url: 'https://a.com/skip',
        title: 'Skip Clip',
        content: 'クリップ',
        tags: [],
        createdAt: Date.now() - 2000,
      });

      const result = await executeWorkerTool('getCrossSourceTopics', {});
      const parsed = JSON.parse(result.result);
      // skip 記事は除外されるので sourceCount=1 (clip のみ) → トピックに含まれない
      expect(parsed.totalTopics).toBe(0);
    });

    it('データなしで空配列', async () => {
      const result = await executeWorkerTool('getCrossSourceTopics', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.topics).toEqual([]);
      expect(parsed.totalTopics).toBe(0);
      expect(parsed.periodDays).toBe(7);
    });
  });

  describe('getMonthlyGoalStats', () => {
    it('goal メモリの統計を返す', async () => {
      await saveMemory('TOEIC 800点を目指す（2026年6月末）', 'goal', { importance: 4 });
      await saveMemory('毎日30分の読書', 'goal', { importance: 3 });

      const result = await executeWorkerTool('getMonthlyGoalStats', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.totalGoals).toBe(2);
      expect(parsed.goals).toHaveLength(2);
      expect(parsed.goals[0]).toHaveProperty('status');
      expect(parsed.goals[0]).toHaveProperty('daysSinceCreation');
      expect(parsed.goals[0]).toHaveProperty('daysSinceUpdate');
    });

    it('goal なしで正常動作', async () => {
      const result = await executeWorkerTool('getMonthlyGoalStats', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.totalGoals).toBe(0);
      expect(parsed.goals).toEqual([]);
    });
  });

  describe('getUserActivityPatterns', () => {
    it('デフォルト periodDays=14 で結果を返す', async () => {
      const now = Date.now();
      await addHeartbeatResult({ taskId: 'task-a', timestamp: now - 1000, hasChanges: true, summary: 'A' });
      await setHeartbeatFeedback('task-a', now - 1000, 'accepted');

      const result = await executeWorkerTool('getUserActivityPatterns', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.periodDays).toBe(14);
      expect(parsed.totalResults).toBe(1);
      expect(parsed.totalWithFeedback).toBe(1);
      expect(parsed.hourlyActivity).toBeDefined();
      expect(parsed.dailyActivity).toBeDefined();
      expect(parsed.taskTrends).toBeDefined();
      expect(parsed.topTags).toBeDefined();
      expect(parsed.bestHours).toBeDefined();
      expect(parsed.bestDays).toBeDefined();
    });

    it('periodDays がクランプされる（0→1、60→30）', async () => {
      const r1 = await executeWorkerTool('getUserActivityPatterns', { periodDays: 0 });
      const p1 = JSON.parse(r1.result);
      expect(p1.periodDays).toBe(1);

      const r2 = await executeWorkerTool('getUserActivityPatterns', { periodDays: 60 });
      const p2 = JSON.parse(r2.result);
      expect(p2.periodDays).toBe(30);
    });

    it('データなしで安全にデフォルト値を返す', async () => {
      const result = await executeWorkerTool('getUserActivityPatterns', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.totalResults).toBe(0);
      expect(parsed.totalWithFeedback).toBe(0);
      expect(parsed.hourlyActivity).toEqual([]);
      expect(parsed.dailyActivity).toEqual([]);
      expect(parsed.taskTrends).toEqual([]);
      expect(parsed.topTags).toEqual([]);
      expect(parsed.bestHours).toEqual([]);
      expect(parsed.bestDays).toEqual([]);
    });
  });

  describe('不明なツール', () => {
    it('エラーメッセージを返す', async () => {
      const result = await executeWorkerTool('unknownTool', {});
      const parsed = JSON.parse(result.result);
      expect(parsed.error).toContain('不明なツール');
    });
  });
});

// --- computeMonthlyGoalStats テスト ---
describe('computeMonthlyGoalStats', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date('2026-03-01T08:00:00');
  const nowMs = now.getTime();

  function makeGoal(overrides: Partial<Memory> & { content: string }): Memory {
    return {
      id: crypto.randomUUID(),
      category: 'goal',
      importance: 3,
      tags: [],
      accessCount: 0,
      lastAccessedAt: nowMs,
      contentHash: 'dummy',
      createdAt: nowMs - 60 * DAY_MS,
      updatedAt: nowMs - 1 * DAY_MS,
      ...overrides,
    };
  }

  it('活動中の goal を正しく分類する', () => {
    const goals = [makeGoal({ content: '毎日30分の読書', updatedAt: nowMs - 2 * DAY_MS })];
    const stats = computeMonthlyGoalStats(goals, now);
    expect(stats.totalGoals).toBe(1);
    expect(stats.activeGoals).toBe(1);
    expect(stats.goals[0].status).toBe('active');
  });

  it('停滞中の goal を正しく分類する（7日以上更新なし）', () => {
    const goals = [makeGoal({ content: 'ダイエット', updatedAt: nowMs - 10 * DAY_MS })];
    const stats = computeMonthlyGoalStats(goals, now);
    expect(stats.staleGoals).toBe(1);
    expect(stats.goals[0].status).toBe('stale');
    expect(stats.goals[0].daysSinceUpdate).toBe(10);
  });

  it('新規 goal を正しく分類する（30日以内に作成）', () => {
    const goals = [makeGoal({ content: '新しい目標', createdAt: nowMs - 5 * DAY_MS })];
    const stats = computeMonthlyGoalStats(goals, now);
    expect(stats.newGoalsThisMonth).toBe(1);
    expect(stats.goals[0].status).toBe('new');
  });

  it('期限超過の goal を正しく分類する', () => {
    const goals = [makeGoal({ content: 'レポート提出 2026年2月15日', updatedAt: nowMs - 2 * DAY_MS })];
    const stats = computeMonthlyGoalStats(goals, now);
    expect(stats.overdueGoals).toBe(1);
    expect(stats.goalsWithDeadline).toBe(1);
    expect(stats.goals[0].status).toBe('overdue');
    expect(stats.goals[0].deadline).toBeDefined();
    expect(stats.goals[0].deadline!.daysUntil).toBeLessThan(0);
  });

  it('期日が未来の goal に deadline 情報を付加する', () => {
    const goals = [makeGoal({ content: 'TOEIC 800点 2026年6月末', updatedAt: nowMs - 2 * DAY_MS })];
    const stats = computeMonthlyGoalStats(goals, now);
    expect(stats.goalsWithDeadline).toBe(1);
    expect(stats.goals[0].deadline).toBeDefined();
    expect(stats.goals[0].deadline!.daysUntil).toBeGreaterThan(0);
    expect(stats.goals[0].status).toBe('active'); // 期日未到来なので overdue ではない
  });

  it('新規作成かつ停滞の goal は stale を優先する', () => {
    // 20日前に作成（30日以内 = new 候補）だが 10日間更新なし（7日以上 = stale 候補）
    const goals = [makeGoal({ content: '新しいけど放置', createdAt: nowMs - 20 * DAY_MS, updatedAt: nowMs - 10 * DAY_MS })];
    const stats = computeMonthlyGoalStats(goals, now);
    expect(stats.staleGoals).toBe(1);
    expect(stats.newGoalsThisMonth).toBe(0);
    expect(stats.goals[0].status).toBe('stale');
  });

  it('期日なしの goal に deadline を付加しない', () => {
    const goals = [makeGoal({ content: '健康的な生活を送る' })];
    const stats = computeMonthlyGoalStats(goals, now);
    expect(stats.goalsWithDeadline).toBe(0);
    expect(stats.goals[0].deadline).toBeUndefined();
  });

  it('複数 goal のミックスで正しく集計する', () => {
    const goals = [
      makeGoal({ content: '活動中の目標', updatedAt: nowMs - 2 * DAY_MS }),
      makeGoal({ content: '停滞中の目標', updatedAt: nowMs - 14 * DAY_MS }),
      makeGoal({ content: '新規目標', createdAt: nowMs - 3 * DAY_MS }),
      makeGoal({ content: '期限超過 2026年2月10日', updatedAt: nowMs - 2 * DAY_MS }),
    ];
    const stats = computeMonthlyGoalStats(goals, now);
    expect(stats.totalGoals).toBe(4);
    expect(stats.activeGoals).toBe(1);
    expect(stats.staleGoals).toBe(1);
    expect(stats.newGoalsThisMonth).toBe(1);
    expect(stats.overdueGoals).toBe(1);
  });

  it('goal なしで全カウント 0', () => {
    const stats = computeMonthlyGoalStats([], now);
    expect(stats.totalGoals).toBe(0);
    expect(stats.activeGoals).toBe(0);
    expect(stats.staleGoals).toBe(0);
    expect(stats.overdueGoals).toBe(0);
    expect(stats.goalsWithDeadline).toBe(0);
    expect(stats.newGoalsThisMonth).toBe(0);
    expect(stats.goals).toEqual([]);
  });
});

// --- ヘルパー関数テスト ---
describe('normalizeUrl', () => {
  it('UTM パラメータを除去する', () => {
    const url = 'https://example.com/article?utm_source=twitter&utm_medium=social&id=123';
    const normalized = normalizeUrl(url);
    expect(normalized).not.toContain('utm_source');
    expect(normalized).not.toContain('utm_medium');
    expect(normalized).toContain('id=123');
  });

  it('末尾スラッシュを統一する', () => {
    const a = normalizeUrl('https://example.com/page/');
    const b = normalizeUrl('https://example.com/page');
    expect(a).toBe(b);
  });

  it('ホスト名のみ小文字化する（パスは保持）', () => {
    const a = normalizeUrl('https://Example.COM/Page');
    expect(a).toBe('https://example.com/Page');
    // ホストが同じならパスの大文字小文字で区別される
    const b = normalizeUrl('https://example.com/page');
    expect(b).toBe('https://example.com/page');
  });

  it('不正 URL はそのまま小文字化してフォールバック', () => {
    const result = normalizeUrl('NOT-A-URL');
    expect(result).toBe('not-a-url');
  });

  it('フラグメントを除去する', () => {
    const result = normalizeUrl('https://example.com/page#section');
    expect(result).not.toContain('#section');
  });
});

describe('extractKeyTokens', () => {
  it('英語タイトルからトークンを抽出する', () => {
    const tokens = extractKeyTokens('Bun 1.2 Release Performance Improvements');
    expect(tokens.has('bun')).toBe(true);
    expect(tokens.has('1.2')).toBe(true);
    expect(tokens.has('release')).toBe(true);
    expect(tokens.has('performance')).toBe(true);
  });

  it('英語ストップワードを除外する', () => {
    const tokens = extractKeyTokens('The new release is in the works');
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('is')).toBe(false);
    expect(tokens.has('in')).toBe(false);
    expect(tokens.has('release')).toBe(true);
    expect(tokens.has('works')).toBe(true);
  });

  it('日本語タイトルからトークンを抽出する', () => {
    const tokens = extractKeyTokens('Bun 1.2 リリース パフォーマンス改善');
    expect(tokens.has('bun')).toBe(true);
    expect(tokens.has('1.2')).toBe(true);
    expect(tokens.has('リリース')).toBe(true);
    expect(tokens.has('パフォーマンス改善')).toBe(true);
  });

  it('2文字未満のトークンを除外する', () => {
    const tokens = extractKeyTokens('A B cd efg');
    expect(tokens.has('a')).toBe(false);
    expect(tokens.has('b')).toBe(false);
    expect(tokens.has('cd')).toBe(true);
    expect(tokens.has('efg')).toBe(true);
  });
});

describe('countCommonTokens', () => {
  it('共通トークンの数を正しくカウントする', () => {
    const a = new Set(['bun', '1.2', 'release']);
    const b = new Set(['bun', '1.2', 'performance']);
    expect(countCommonTokens(a, b)).toBe(2);
  });

  it('共通要素がない場合 0 を返す', () => {
    const a = new Set(['react', 'hooks']);
    const b = new Set(['vue', 'composable']);
    expect(countCommonTokens(a, b)).toBe(0);
  });
});

describe('groupByTopic', () => {
  it('URL 一致でグルーピングする', () => {
    const items: UnifiedItem[] = [
      { id: '1', source: 'feed', title: 'Bun リリース', link: 'https://example.com/bun', isRead: false, publishedAt: 1000, feedId: 'fa', feedTitle: 'フィードA' },
      { id: '2', source: 'clip', title: 'Bun の記事', link: 'https://example.com/bun', isRead: true, publishedAt: 2000 },
    ];
    const groups = groupByTopic(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].sourceCount).toBe(2);
  });

  it('タイトル類似でグルーピングする', () => {
    const items: UnifiedItem[] = [
      { id: '1', source: 'feed', title: 'Bun 1.2 パフォーマンス改善リリース', link: 'https://a.com/bun', isRead: false, publishedAt: 1000, feedId: 'fa', feedTitle: 'フィードA' },
      { id: '2', source: 'feed', title: 'Bun 1.2 リリース パフォーマンス比較', link: 'https://b.com/bun', isRead: true, publishedAt: 2000, feedId: 'fb', feedTitle: 'フィードB' },
    ];
    const groups = groupByTopic(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].sourceCount).toBe(2);
  });

  it('sourceCount 降順でソートする', () => {
    const items: UnifiedItem[] = [
      { id: '1', source: 'feed', title: 'React 19 新機能紹介', link: 'https://a.com/react', isRead: false, publishedAt: 1000, feedId: 'fa', feedTitle: 'フィードA' },
      { id: '2', source: 'clip', title: 'React 19 新機能まとめ', link: 'https://b.com/react', isRead: true, publishedAt: 2000 },
      { id: '3', source: 'feed', title: 'Bun 1.2 パフォーマンスリリース', link: 'https://a.com/bun', isRead: false, publishedAt: 3000, feedId: 'fa', feedTitle: 'フィードA' },
      { id: '4', source: 'feed', title: 'Bun 1.2 リリースパフォーマンス比較', link: 'https://b.com/bun', isRead: true, publishedAt: 4000, feedId: 'fb', feedTitle: 'フィードB' },
      { id: '5', source: 'clip', title: 'Bun 1.2 テストパフォーマンス', link: 'https://c.com/bun', isRead: true, publishedAt: 5000 },
    ];
    const groups = groupByTopic(items);
    // Bun グループ (3ソース) が先に来るはず
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups[0].sourceCount).toBeGreaterThanOrEqual(groups[1].sourceCount);
  });

  it('空配列で空配列を返す', () => {
    const groups = groupByTopic([]);
    expect(groups).toEqual([]);
  });

  it('最長タイトルが topicTitle になる', () => {
    const items: UnifiedItem[] = [
      { id: '1', source: 'feed', title: 'Short', link: 'https://a.com/x', isRead: false, publishedAt: 1000, feedId: 'fa', feedTitle: 'A' },
      { id: '2', source: 'clip', title: 'Much Longer Title Here', link: 'https://a.com/x', isRead: true, publishedAt: 2000 },
    ];
    const groups = groupByTopic(items);
    expect(groups[0].topicTitle).toBe('Much Longer Title Here');
  });
});

// --- computeUserActivityPatterns テスト ---
describe('computeUserActivityPatterns', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const now = new Date('2026-03-01T12:00:00+09:00');
  const nowMs = now.getTime();

  function makeResult(overrides: Partial<HeartbeatResult> & { taskId: string; timestamp: number }): HeartbeatResult {
    return {
      hasChanges: true,
      summary: 'テスト',
      ...overrides,
    };
  }

  function makeMemory(overrides: Partial<Memory> & { content: string; tags: string[] }): Memory {
    return {
      id: crypto.randomUUID(),
      category: 'fact',
      importance: 3,
      accessCount: 0,
      lastAccessedAt: nowMs,
      contentHash: 'dummy',
      createdAt: nowMs - 7 * 24 * HOUR_MS,
      updatedAt: nowMs - 7 * 24 * HOUR_MS,
      ...overrides,
    };
  }

  it('空の結果で安全にデフォルト値を返す', () => {
    const patterns = computeUserActivityPatterns([], [], now);
    expect(patterns.totalResults).toBe(0);
    expect(patterns.totalWithFeedback).toBe(0);
    expect(patterns.hourlyActivity).toEqual([]);
    expect(patterns.dailyActivity).toEqual([]);
    expect(patterns.taskTrends).toEqual([]);
    expect(patterns.topTags).toEqual([]);
    expect(patterns.bestHours).toEqual([]);
    expect(patterns.bestDays).toEqual([]);
  });

  it('時間帯別 Accept 率を正しく集計する', () => {
    // JST 10:00 に accepted 2件、dismissed 1件
    const baseTs = new Date('2026-03-01T10:00:00+09:00').getTime();
    const results: HeartbeatResult[] = [
      makeResult({ taskId: 'a', timestamp: baseTs, feedback: { type: 'accepted', timestamp: baseTs + 1000 } }),
      makeResult({ taskId: 'b', timestamp: baseTs + 1000, feedback: { type: 'accepted', timestamp: baseTs + 2000 } }),
      makeResult({ taskId: 'c', timestamp: baseTs + 2000, feedback: { type: 'dismissed', timestamp: baseTs + 3000 } }),
    ];
    const patterns = computeUserActivityPatterns(results, [], now);
    const hour10 = patterns.hourlyActivity.find((h) => h.hour === 10);
    expect(hour10).toBeDefined();
    expect(hour10!.total).toBe(3);
    expect(hour10!.accepted).toBe(2);
    expect(hour10!.acceptRate).toBeCloseTo(2 / 3);
  });

  it('bestHours に Accept 率上位 3 時間帯を返す', () => {
    // 各時間帯に 2 件以上のデータを配置
    const results: HeartbeatResult[] = [];
    // 9:00 — accept 率 100% (2/2)
    for (let i = 0; i < 2; i++) {
      const ts = new Date(`2026-03-01T09:0${i}:00+09:00`).getTime();
      results.push(makeResult({ taskId: `a${i}`, timestamp: ts, feedback: { type: 'accepted', timestamp: ts + 1000 } }));
    }
    // 14:00 — accept 率 50% (1/2)
    const ts14a = new Date('2026-03-01T14:00:00+09:00').getTime();
    const ts14b = new Date('2026-03-01T14:01:00+09:00').getTime();
    results.push(makeResult({ taskId: 'b0', timestamp: ts14a, feedback: { type: 'accepted', timestamp: ts14a + 1000 } }));
    results.push(makeResult({ taskId: 'b1', timestamp: ts14b, feedback: { type: 'dismissed', timestamp: ts14b + 1000 } }));
    // 20:00 — accept 率 0% (0/2)
    for (let i = 0; i < 2; i++) {
      const ts = new Date(`2026-03-01T20:0${i}:00+09:00`).getTime();
      results.push(makeResult({ taskId: `c${i}`, timestamp: ts, feedback: { type: 'dismissed', timestamp: ts + 1000 } }));
    }
    // 11:00 — 1件のみ（total < 2 なので bestHours 対象外）
    const ts11 = new Date('2026-03-01T11:00:00+09:00').getTime();
    results.push(makeResult({ taskId: 'd0', timestamp: ts11, feedback: { type: 'accepted', timestamp: ts11 + 1000 } }));

    const patterns = computeUserActivityPatterns(results, [], now);
    expect(patterns.bestHours).toHaveLength(3);
    expect(patterns.bestHours[0]).toBe(9);  // 100%
    expect(patterns.bestHours[1]).toBe(14); // 50%
    expect(patterns.bestHours[2]).toBe(20); // 0%
  });

  it('曜日別アクティビティを集計する', () => {
    // 2026-03-01 は日曜日 (JST)
    const sundayTs = new Date('2026-03-01T10:00:00+09:00').getTime();
    const results: HeartbeatResult[] = [
      makeResult({ taskId: 'a', timestamp: sundayTs, feedback: { type: 'accepted', timestamp: sundayTs + 1000 } }),
      makeResult({ taskId: 'b', timestamp: sundayTs + 1000, feedback: { type: 'dismissed', timestamp: sundayTs + 2000 } }),
    ];
    const patterns = computeUserActivityPatterns(results, [], now);
    const sunday = patterns.dailyActivity.find((d) => d.dayOfWeek === 0);
    expect(sunday).toBeDefined();
    expect(sunday!.dayName).toBe('日曜日');
    expect(sunday!.totalResults).toBe(2);
    expect(sunday!.accepted).toBe(1);
    expect(sunday!.acceptRate).toBeCloseTo(0.5);
  });

  it('bestDays に Accept 率上位曜日を返す', () => {
    // 日曜 (0) = 100%, 月曜 (1) = 50%
    const sunTs = new Date('2026-03-01T10:00:00+09:00').getTime(); // 日曜
    const monTs = new Date('2026-03-02T10:00:00+09:00').getTime(); // 月曜
    const results: HeartbeatResult[] = [
      makeResult({ taskId: 'a', timestamp: sunTs, feedback: { type: 'accepted', timestamp: sunTs + 1000 } }),
      makeResult({ taskId: 'b', timestamp: sunTs + 60000, feedback: { type: 'accepted', timestamp: sunTs + 61000 } }),
      makeResult({ taskId: 'c', timestamp: monTs, feedback: { type: 'accepted', timestamp: monTs + 1000 } }),
      makeResult({ taskId: 'd', timestamp: monTs + 60000, feedback: { type: 'dismissed', timestamp: monTs + 61000 } }),
    ];
    const patterns = computeUserActivityPatterns(results, [], now);
    expect(patterns.bestDays.length).toBeGreaterThanOrEqual(2);
    expect(patterns.bestDays[0]).toBe(0); // 日曜 100%
    expect(patterns.bestDays[1]).toBe(1); // 月曜 50%
  });

  it('タスク別トレンドを検出する（improving/declining/stable）', () => {
    // 前半: task-x 全 dismissed、task-y 全 accepted、task-z 半分
    // 後半: task-x 全 accepted、task-y 全 dismissed、task-z 半分
    const results: HeartbeatResult[] = [];
    // 前半（古い）
    for (let i = 0; i < 4; i++) {
      const ts = nowMs - 10 * 24 * HOUR_MS + i * HOUR_MS;
      results.push(makeResult({ taskId: 'task-x', timestamp: ts, feedback: { type: 'dismissed', timestamp: ts + 1000 } }));
      results.push(makeResult({ taskId: 'task-y', timestamp: ts + 100, feedback: { type: 'accepted', timestamp: ts + 1100 } }));
      results.push(makeResult({ taskId: 'task-z', timestamp: ts + 200, feedback: { type: i < 2 ? 'accepted' : 'dismissed', timestamp: ts + 1200 } }));
    }
    // 後半（新しい）
    for (let i = 0; i < 4; i++) {
      const ts = nowMs - 3 * 24 * HOUR_MS + i * HOUR_MS;
      results.push(makeResult({ taskId: 'task-x', timestamp: ts, feedback: { type: 'accepted', timestamp: ts + 1000 } }));
      results.push(makeResult({ taskId: 'task-y', timestamp: ts + 100, feedback: { type: 'dismissed', timestamp: ts + 1100 } }));
      results.push(makeResult({ taskId: 'task-z', timestamp: ts + 200, feedback: { type: i < 2 ? 'accepted' : 'dismissed', timestamp: ts + 1200 } }));
    }

    const patterns = computeUserActivityPatterns(results, [], now);
    const trendX = patterns.taskTrends.find((t) => t.taskId === 'task-x');
    const trendY = patterns.taskTrends.find((t) => t.taskId === 'task-y');
    const trendZ = patterns.taskTrends.find((t) => t.taskId === 'task-z');
    expect(trendX!.trend).toBe('improving');    // 0% → 100%
    expect(trendY!.trend).toBe('declining');     // 100% → 0%
    expect(trendZ!.trend).toBe('stable');        // 50% → 50%
  });

  it('タグ頻出度の変化を検出する', () => {
    const memories: Memory[] = [];
    // 前半: tag-a が多い
    for (let i = 0; i < 4; i++) {
      memories.push(makeMemory({
        content: `メモ前半${i}`,
        tags: ['tag-a'],
        createdAt: nowMs - 14 * 24 * HOUR_MS + i * HOUR_MS,
      }));
    }
    // 後半: tag-b が多い
    for (let i = 0; i < 4; i++) {
      memories.push(makeMemory({
        content: `メモ後半${i}`,
        tags: ['tag-b'],
        createdAt: nowMs - 3 * 24 * HOUR_MS + i * HOUR_MS,
      }));
    }

    const patterns = computeUserActivityPatterns([], memories, now);
    const tagA = patterns.topTags.find((t) => t.tag === 'tag-a');
    const tagB = patterns.topTags.find((t) => t.tag === 'tag-b');
    expect(tagA!.trend).toBe('falling');  // 前半に多い → 後半に少ない
    expect(tagB!.trend).toBe('rising');   // 前半に少ない → 後半に多い
  });

  it('feedback なしの結果を Accept 率計算に含めない', () => {
    const ts1 = nowMs - HOUR_MS;
    const ts2 = nowMs - 2 * HOUR_MS;
    const ts3 = nowMs - 3 * HOUR_MS;
    const results: HeartbeatResult[] = [
      makeResult({ taskId: 'a', timestamp: ts1, feedback: { type: 'accepted', timestamp: ts1 + 1000 } }),
      makeResult({ taskId: 'b', timestamp: ts2 }), // feedback なし
      makeResult({ taskId: 'c', timestamp: ts3 }), // feedback なし
    ];
    const patterns = computeUserActivityPatterns(results, [], now);
    expect(patterns.totalResults).toBe(3);
    expect(patterns.totalWithFeedback).toBe(1);
    // hourlyActivity は feedback ありのみ
    const totalInHourly = patterns.hourlyActivity.reduce((sum, h) => sum + h.total, 0);
    expect(totalInHourly).toBe(1);
  });
});

// --- computeSuggestionOptimizations テスト (F16) ---
describe('computeSuggestionOptimizations', () => {
  const now = new Date('2026-03-01T12:00:00+09:00');
  const DAY_MS = 24 * 60 * 60 * 1000;

  function makeFeedback(overrides?: Partial<FeedbackSummary>): FeedbackSummary {
    return {
      periodMs: 14 * DAY_MS,
      totalResults: 0,
      totalWithFeedback: 0,
      overallAcceptRate: 0,
      taskStats: [],
      ...overrides,
    };
  }

  function makeTaskStat(overrides: Partial<TaskFeedbackStats> & { taskId: string }): TaskFeedbackStats {
    return {
      accepted: 0,
      dismissed: 0,
      snoozed: 0,
      total: 0,
      acceptRate: 0,
      ...overrides,
    };
  }

  function makePatterns(overrides?: Partial<UserActivityPatterns>): UserActivityPatterns {
    return {
      totalResults: 0,
      totalWithFeedback: 0,
      hourlyActivity: [],
      dailyActivity: [],
      taskTrends: [],
      topTags: [],
      bestHours: [],
      bestDays: [],
      ...overrides,
    };
  }

  it('空データで安全にデフォルト値を返す', () => {
    const result = computeSuggestionOptimizations(makeFeedback(), makePatterns(), now);
    expect(result.overallAcceptRate).toBe(0);
    expect(result.overallScore).toBe(0);
    expect(result.taskOptimizations).toEqual([]);
    expect(result.timingOptimization.suggestedQuietHours).toEqual([]);
    expect(result.timingOptimization.suggestedQuietDays).toEqual([]);
    expect(result.categoryOptimizations).toEqual([]);
    expect(result.actionableSummary).toContain('総合スコア: 0/100');
  });

  it('Accept率 70% 以上 → maintain', () => {
    const feedback = makeFeedback({
      overallAcceptRate: 0.8,
      taskStats: [makeTaskStat({ taskId: 'task-a', accepted: 8, total: 10, acceptRate: 0.8 })],
    });
    const result = computeSuggestionOptimizations(feedback, makePatterns(), now);
    expect(result.taskOptimizations[0].adjustment).toBe('maintain');
    expect(result.taskOptimizations[0].reason).toContain('良好');
  });

  it('Accept率 40-70% declining → improve', () => {
    const feedback = makeFeedback({
      taskStats: [makeTaskStat({ taskId: 'task-a', accepted: 5, total: 10, acceptRate: 0.5 })],
    });
    const patterns = makePatterns({
      taskTrends: [{ taskId: 'task-a', recentAcceptRate: 0.45, previousAcceptRate: 0.7, trend: 'declining' }],
    });
    const result = computeSuggestionOptimizations(feedback, patterns, now);
    expect(result.taskOptimizations[0].adjustment).toBe('improve');
    expect(result.taskOptimizations[0].trend).toBe('declining');
  });

  it('Accept率 40-70% improving → maintain', () => {
    const feedback = makeFeedback({
      taskStats: [makeTaskStat({ taskId: 'task-a', accepted: 5, total: 10, acceptRate: 0.5 })],
    });
    const patterns = makePatterns({
      taskTrends: [{ taskId: 'task-a', recentAcceptRate: 0.6, previousAcceptRate: 0.3, trend: 'improving' }],
    });
    const result = computeSuggestionOptimizations(feedback, patterns, now);
    expect(result.taskOptimizations[0].adjustment).toBe('maintain');
    expect(result.taskOptimizations[0].trend).toBe('improving');
  });

  it('Accept率 20-40% → reduce-frequency', () => {
    const feedback = makeFeedback({
      taskStats: [makeTaskStat({ taskId: 'task-a', accepted: 3, total: 10, acceptRate: 0.3 })],
    });
    const result = computeSuggestionOptimizations(feedback, makePatterns(), now);
    expect(result.taskOptimizations[0].adjustment).toBe('reduce-frequency');
  });

  it('Accept率 < 20% total >= 5 → disable-candidate', () => {
    const feedback = makeFeedback({
      taskStats: [makeTaskStat({ taskId: 'task-a', accepted: 0, total: 6, acceptRate: 0 })],
    });
    const result = computeSuggestionOptimizations(feedback, makePatterns(), now);
    expect(result.taskOptimizations[0].adjustment).toBe('disable-candidate');
    expect(result.taskOptimizations[0].reason).toContain('無効化を検討');
  });

  it('Accept率 < 20% total < 5 → improve', () => {
    const feedback = makeFeedback({
      taskStats: [makeTaskStat({ taskId: 'task-a', accepted: 0, total: 3, acceptRate: 0 })],
    });
    const result = computeSuggestionOptimizations(feedback, makePatterns(), now);
    expect(result.taskOptimizations[0].adjustment).toBe('improve');
    expect(result.taskOptimizations[0].reason).toContain('サンプル不足');
  });

  it('低 Accept 率時間帯 → suggestedQuietHours', () => {
    const patterns = makePatterns({
      hourlyActivity: [
        { hour: 2, total: 5, accepted: 0, acceptRate: 0 },    // 0% + total >= 3
        { hour: 9, total: 5, accepted: 5, acceptRate: 1.0 },  // 100%
        { hour: 14, total: 2, accepted: 0, acceptRate: 0 },   // 0% だが total < 3
      ],
      bestHours: [9],
      bestDays: [],
    });
    const result = computeSuggestionOptimizations(makeFeedback(), patterns, now);
    expect(result.timingOptimization.suggestedQuietHours).toContain(2);
    expect(result.timingOptimization.suggestedQuietHours).not.toContain(9);
    expect(result.timingOptimization.suggestedQuietHours).not.toContain(14); // total < 3
  });

  it('低 Accept 率曜日 → suggestedQuietDays', () => {
    const patterns = makePatterns({
      dailyActivity: [
        { dayOfWeek: 0, dayName: '日曜日', totalResults: 4, accepted: 0, acceptRate: 0 },
        { dayOfWeek: 1, dayName: '月曜日', totalResults: 5, accepted: 4, acceptRate: 0.8 },
      ],
      bestDays: [1],
    });
    const result = computeSuggestionOptimizations(makeFeedback(), patterns, now);
    expect(result.timingOptimization.suggestedQuietDays).toContain(0);
    expect(result.timingOptimization.suggestedQuietDays).not.toContain(1);
  });

  it('rising/falling タグ → 正/負の weightAdjustment（上限 +-20）', () => {
    const patterns = makePatterns({
      topTags: [
        { tag: 'security', recentCount: 8, previousCount: 2, trend: 'rising' },
        { tag: 'infra', recentCount: 1, previousCount: 6, trend: 'falling' },
        { tag: 'react', recentCount: 3, previousCount: 3, trend: 'stable' },
      ],
    });
    const result = computeSuggestionOptimizations(makeFeedback(), patterns, now);
    const security = result.categoryOptimizations.find((c) => c.tag === 'security');
    const infra = result.categoryOptimizations.find((c) => c.tag === 'infra');
    const react = result.categoryOptimizations.find((c) => c.tag === 'react');

    expect(security!.weightAdjustment).toBeGreaterThan(0);
    expect(security!.weightAdjustment).toBeLessThanOrEqual(20);
    expect(infra!.weightAdjustment).toBeLessThan(0);
    expect(infra!.weightAdjustment).toBeGreaterThanOrEqual(-20);
    expect(react!.weightAdjustment).toBe(0);
  });

  it('weightAdjustment が +-20 で上限クランプされる', () => {
    const patterns = makePatterns({
      topTags: [
        { tag: 'hot-topic', recentCount: 20, previousCount: 0, trend: 'rising' }, // diff=20, 20*5=100 → clamped 20
      ],
    });
    const result = computeSuggestionOptimizations(makeFeedback(), patterns, now);
    expect(result.categoryOptimizations[0].weightAdjustment).toBe(20);
  });

  it('Accept率 70% 以上 → score 100', () => {
    const feedback = makeFeedback({ overallAcceptRate: 0.7 });
    const result = computeSuggestionOptimizations(feedback, makePatterns(), now);
    expect(result.overallScore).toBe(100);
  });

  it('Accept率 0% → score 0', () => {
    const feedback = makeFeedback({ overallAcceptRate: 0 });
    const result = computeSuggestionOptimizations(feedback, makePatterns(), now);
    expect(result.overallScore).toBe(0);
  });

  it('Accept率 35% → score 50', () => {
    const feedback = makeFeedback({ overallAcceptRate: 0.35 });
    const result = computeSuggestionOptimizations(feedback, makePatterns(), now);
    expect(result.overallScore).toBe(50);
  });

  it('Accept率 100% → score 上限 100 にクランプ', () => {
    const feedback = makeFeedback({ overallAcceptRate: 1.0 });
    const result = computeSuggestionOptimizations(feedback, makePatterns(), now);
    expect(result.overallScore).toBe(100);
  });
});

// --- getSuggestionOptimizations Worker ツールテスト (F16) ---
describe('executeWorkerTool: getSuggestionOptimizations', () => {
  it('デフォルト期間 14 日で空データを安全に処理する', async () => {
    const result = JSON.parse((await executeWorkerTool('getSuggestionOptimizations', {})).result);
    expect(result.periodDays).toBe(14);
    expect(result.overallScore).toBe(0);
    expect(result.taskOptimizations).toEqual([]);
    expect(result.totalResults).toBe(0);
    expect(result.totalWithFeedback).toBe(0);
  });

  it('periodDays をクランプする（上限 30）', async () => {
    const result = JSON.parse((await executeWorkerTool('getSuggestionOptimizations', { periodDays: 100 })).result);
    expect(result.periodDays).toBe(30);
  });

  it('periodDays をクランプする（下限 1）', async () => {
    const result = JSON.parse((await executeWorkerTool('getSuggestionOptimizations', { periodDays: -5 })).result);
    expect(result.periodDays).toBe(1);
  });
});

// ============================================================
// applyAction 純粋関数
// ============================================================

function makeHbConfig(overrides?: Partial<HeartbeatConfig>): HeartbeatConfig {
  return {
    enabled: true,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    quietDays: [],
    maxNotificationsPerDay: 0,
    tasks: [
      { id: 'calendar-check', name: 'カレンダー', description: '', enabled: true, type: 'builtin' },
      { id: 'feed-check', name: 'フィード', description: '', enabled: false, type: 'builtin' },
      { id: 'reflection', name: 'ふりかえり', description: '', enabled: true, type: 'builtin', schedule: { type: 'fixed-time', hour: 23, minute: 0 } },
      { id: 'weather-check', name: '天気', description: '', enabled: true, type: 'builtin', schedule: { type: 'interval', intervalMinutes: 60 } },
    ],
    desktopNotification: false,
    focusMode: false,
    ...overrides,
  };
}

describe('applyAction', () => {
  describe('toggle-task', () => {
    it('有効→無効に切り替える', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'toggle-task', taskId: 'calendar-check', enabled: false, reason: 'Accept率低い' });
      expect(result.applied).toBe(true);
      expect(hb.tasks.find((t) => t.id === 'calendar-check')!.enabled).toBe(false);
    });

    it('無効→有効に切り替える', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'toggle-task', taskId: 'feed-check', enabled: true, reason: 'テスト' });
      expect(result.applied).toBe(true);
      expect(hb.tasks.find((t) => t.id === 'feed-check')!.enabled).toBe(true);
    });

    it('存在しないタスクはエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'toggle-task', taskId: 'nonexistent', enabled: false, reason: 'テスト' });
      expect(result.applied).toBe(false);
      expect(result.detail).toContain('見つかりません');
    });

    it('taskId 未指定はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'toggle-task', enabled: false, reason: 'テスト' });
      expect(result.applied).toBe(false);
      expect(result.detail).toContain('taskId');
    });

    it('enabled 未指定はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'toggle-task', taskId: 'calendar-check', reason: 'テスト' });
      expect(result.applied).toBe(false);
      expect(result.detail).toContain('enabled');
    });

    it('既に同じ状態なら不適用', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'toggle-task', taskId: 'calendar-check', enabled: true, reason: 'テスト' });
      expect(result.applied).toBe(false);
      expect(result.detail).toContain('既に');
    });
  });

  describe('update-quiet-hours', () => {
    it('正常に静寂時間を変更する', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-quiet-hours', quietHoursStart: 22, quietHoursEnd: 7, reason: 'パターン分析' });
      expect(result.applied).toBe(true);
      expect(hb.quietHoursStart).toBe(22);
      expect(hb.quietHoursEnd).toBe(7);
    });

    it('範囲外はエラー (start)', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-quiet-hours', quietHoursStart: 25, quietHoursEnd: 6, reason: 'テスト' });
      expect(result.applied).toBe(false);
    });

    it('範囲外はエラー (end)', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-quiet-hours', quietHoursStart: 0, quietHoursEnd: -1, reason: 'テスト' });
      expect(result.applied).toBe(false);
    });

    it('未指定はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-quiet-hours', reason: 'テスト' });
      expect(result.applied).toBe(false);
    });

    it('小数はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-quiet-hours', quietHoursStart: 1.5, quietHoursEnd: 6, reason: 'テスト' });
      expect(result.applied).toBe(false);
      expect(result.detail).toContain('整数');
    });
  });

  describe('update-quiet-days', () => {
    it('正常に静寂曜日を変更する', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-quiet-days', quietDays: [0, 6], reason: '週末は休み' });
      expect(result.applied).toBe(true);
      expect(hb.quietDays).toEqual([0, 6]);
    });

    it('重複は除去してソートされる', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-quiet-days', quietDays: [6, 0, 6], reason: 'テスト' });
      expect(result.applied).toBe(true);
      expect(hb.quietDays).toEqual([0, 6]);
    });

    it('無効な曜日はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-quiet-days', quietDays: [7], reason: 'テスト' });
      expect(result.applied).toBe(false);
    });

    it('空配列でクリアできる', () => {
      const hb = makeHbConfig({ quietDays: [0, 6] });
      const result = applyAction(hb, { type: 'update-quiet-days', quietDays: [], reason: 'テスト' });
      expect(result.applied).toBe(true);
      expect(hb.quietDays).toEqual([]);
    });

    it('未指定はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-quiet-days', reason: 'テスト' });
      expect(result.applied).toBe(false);
    });
  });

  describe('update-task-interval', () => {
    it('global タスクを interval に変換する', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-task-interval', taskId: 'calendar-check', intervalMinutes: 45, reason: 'テスト' });
      expect(result.applied).toBe(true);
      const task = hb.tasks.find((t) => t.id === 'calendar-check')!;
      expect(task.schedule).toEqual({ type: 'interval', intervalMinutes: 45 });
    });

    it('interval タスクの間隔を更新する', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-task-interval', taskId: 'weather-check', intervalMinutes: 90, reason: 'テスト' });
      expect(result.applied).toBe(true);
      const task = hb.tasks.find((t) => t.id === 'weather-check')!;
      expect(task.schedule!.intervalMinutes).toBe(90);
    });

    it('fixed-time タスクは変更不可', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-task-interval', taskId: 'reflection', intervalMinutes: 60, reason: 'テスト' });
      expect(result.applied).toBe(false);
      expect(result.detail).toContain('固定時刻');
    });

    it('範囲外（下限）はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-task-interval', taskId: 'calendar-check', intervalMinutes: 3, reason: 'テスト' });
      expect(result.applied).toBe(false);
    });

    it('範囲外（上限）はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-task-interval', taskId: 'calendar-check', intervalMinutes: 1500, reason: 'テスト' });
      expect(result.applied).toBe(false);
    });

    it('taskId 未指定はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-task-interval', intervalMinutes: 60, reason: 'テスト' });
      expect(result.applied).toBe(false);
    });

    it('intervalMinutes 未指定はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'update-task-interval', taskId: 'calendar-check', reason: 'テスト' });
      expect(result.applied).toBe(false);
    });
  });

  describe('不明なアクション型', () => {
    it('不明な型はエラー', () => {
      const hb = makeHbConfig();
      const result = applyAction(hb, { type: 'unknown-action' as ActionRequest['type'], reason: 'テスト' });
      expect(result.applied).toBe(false);
      expect(result.detail).toContain('不明なアクション型');
    });
  });
});

// ============================================================
// applyHeartbeatConfigAction Worker ツール
// ============================================================
describe('executeWorkerTool: applyHeartbeatConfigAction', () => {
  it('actions が空配列ならエラー', async () => {
    const toolResult = await executeWorkerTool('applyHeartbeatConfigAction', { actions: [] });
    const result = JSON.parse(toolResult.result);
    expect(result.error).toBeDefined();
    expect(toolResult.configChanged).toBe(false);
  });

  it('actions が未指定ならエラー', async () => {
    const toolResult = await executeWorkerTool('applyHeartbeatConfigAction', {});
    const result = JSON.parse(toolResult.result);
    expect(result.error).toBeDefined();
    expect(toolResult.configChanged).toBe(false);
  });

  it('設定がない場合はエラー', async () => {
    // IDB に設定なし
    const toolResult = await executeWorkerTool('applyHeartbeatConfigAction', {
      actions: [{ type: 'toggle-task', taskId: 'calendar-check', enabled: false, reason: 'テスト' }],
    });
    const result = JSON.parse(toolResult.result);
    expect(result.error).toContain('Heartbeat 設定が見つかりません');
    expect(toolResult.configChanged).toBe(false);
  });

  it('設定ありでアクションを適用する', async () => {
    // IDB に設定を保存
    const { saveConfigToIDB } = await import('../store/configStore');
    await saveConfigToIDB({
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeHbConfig(),
    });

    const toolResult = await executeWorkerTool('applyHeartbeatConfigAction', {
      actions: [
        { type: 'toggle-task', taskId: 'calendar-check', enabled: false, reason: 'Accept率低い' },
        { type: 'update-quiet-hours', quietHoursStart: 22, quietHoursEnd: 7, reason: 'パターン分析' },
      ],
    });
    const result = JSON.parse(toolResult.result);
    expect(result.appliedCount).toBe(2);
    expect(result.totalActions).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].applied).toBe(true);
    expect(result.results[1].applied).toBe(true);
    expect(toolResult.configChanged).toBe(true);
  });

  it('一部失敗しても他のアクションは適用される', async () => {
    const { saveConfigToIDB } = await import('../store/configStore');
    await saveConfigToIDB({
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: makeHbConfig(),
    });

    const toolResult = await executeWorkerTool('applyHeartbeatConfigAction', {
      actions: [
        { type: 'toggle-task', taskId: 'nonexistent', enabled: false, reason: 'テスト' },
        { type: 'update-quiet-days', quietDays: [0, 6], reason: 'テスト' },
      ],
    });
    const result = JSON.parse(toolResult.result);
    expect(result.appliedCount).toBe(1);
    expect(result.totalActions).toBe(2);
    expect(result.results[0].applied).toBe(false);
    expect(result.results[1].applied).toBe(true);
    expect(toolResult.configChanged).toBe(true);
  });
});
