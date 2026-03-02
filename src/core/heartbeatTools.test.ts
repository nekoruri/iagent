import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import {
  WORKER_TOOLS, executeWorkerTool,
  normalizeUrl, extractKeyTokens, countCommonTokens, groupByTopic,
} from './heartbeatTools';
import type { UnifiedItem } from './heartbeatTools';
import { getDB } from '../store/db';
import { saveMemory } from '../store/memoryStore';
import { saveFeed, saveFeedItems } from '../store/feedStore';
import { addHeartbeatResult, setHeartbeatFeedback } from '../store/heartbeatStore';

beforeEach(() => {
  __resetStores();
});

describe('WORKER_TOOLS', () => {
  it('全 Worker ツールが定義されている', () => {
    expect(WORKER_TOOLS).toHaveLength(16);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].title).toBe('会議');
    });
  });

  describe('getCurrentTime', () => {
    it('現在時刻を返す', async () => {
      const result = await executeWorkerTool('getCurrentTime', {});
      const parsed = JSON.parse(result);
      expect(parsed.currentTime).toBeDefined();
      expect(typeof parsed.currentTime).toBe('string');
    });
  });

  describe('getRecentMemoriesForReflection', () => {
    it('直近の記憶とアクセス上位を返す', async () => {
      await saveMemory('最近のメモリ', 'fact');
      await saveMemory('もう一つの記憶', 'preference');

      const result = await executeWorkerTool('getRecentMemoriesForReflection', {});
      const parsed = JSON.parse(result);
      expect(parsed.recentCount).toBe(2);
      expect(parsed.topAccessedCount).toBe(2);
      expect(parsed.recent).toHaveLength(2);
      expect(parsed.topAccessed).toHaveLength(2);
    });

    it('記憶なしでも正常に動作する', async () => {
      const result = await executeWorkerTool('getRecentMemoriesForReflection', {});
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
      expect(parsed.message).toBe('ふりかえりを保存しました');
      expect(parsed.memory.category).toBe('reflection');
      expect(parsed.memory.importance).toBe(4);
      expect(parsed.memory.tags).toEqual(['洞察', 'パターン']);
    });

    it('content なしでエラーを返す', async () => {
      const result = await executeWorkerTool('saveReflection', {});
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('content は必須です');
    });

    it('デフォルト importance は 3', async () => {
      const result = await executeWorkerTool('saveReflection', {
        content: 'シンプルな振り返り',
      });
      const parsed = JSON.parse(result);
      expect(parsed.memory.importance).toBe(3);
    });
  });

  describe('cleanupMemories', () => {
    it('低スコア記憶をアーカイブする', async () => {
      for (let i = 0; i < 10; i++) {
        await saveMemory(`メモリ ${i}`, 'other');
      }

      const result = await executeWorkerTool('cleanupMemories', {});
      const parsed = JSON.parse(result);
      expect(parsed.archivedCount).toBe(5);
      expect(parsed.message).toContain('5 件');
    });

    it('記憶なしでもエラーにならない', async () => {
      const result = await executeWorkerTool('cleanupMemories', {});
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
      expect(parsed.items[0].excerpt).toHaveLength(100);
    });

    it('offset/limit の負数・極大値がクランプされる', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, Array.from({ length: 5 }, (_, i) => ({
        guid: `g${i}`, title: `Item ${i}`, link: `https://a.com/${i}`, content: '本文', publishedAt: i * 1000,
      })));

      // 負の offset → 0 にクランプ
      const r1 = await executeWorkerTool('listUnreadFeedItems', { offset: -5, limit: 10 });
      const p1 = JSON.parse(r1);
      expect(p1.items).toHaveLength(5);
      expect(p1.offset).toBe(0);

      // limit 200 → 100 にクランプ、limit 0 → 1 にクランプ
      const r2 = await executeWorkerTool('listUnreadFeedItems', { offset: 0, limit: 200 });
      const p2 = JSON.parse(r2);
      expect(p2.limit).toBe(100);

      const r3 = await executeWorkerTool('listUnreadFeedItems', { offset: 0, limit: 0 });
      const p3 = JSON.parse(r3);
      expect(p3.limit).toBe(1);
    });

    it('ページングが動作する', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'A' });
      await saveFeedItems(feed.id, Array.from({ length: 5 }, (_, i) => ({
        guid: `g${i}`, title: `Item ${i}`, link: `https://a.com/${i}`, content: '本文', publishedAt: i * 1000,
      })));

      const result = await executeWorkerTool('listUnreadFeedItems', { offset: 0, limit: 2 });
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
      expect(parsed.savedCount).toBe(1); // 存在する 1 件のみカウント
    });

    it('classifications なしでエラーを返す', async () => {
      const result = await executeWorkerTool('saveFeedClassification', {});
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
      expect(parsed.periodHours).toBe(24);
      expect(parsed.totalResults).toBe(2);
      expect(parsed.totalWithFeedback).toBe(2);
      expect(parsed.overallAcceptRate).toBe(50); // 1/2 = 50%
      expect(parsed.taskStats).toHaveLength(2);
    });

    it('periodHours がクランプされる（1-168）', async () => {
      // 0 → 1 にクランプ
      const r1 = await executeWorkerTool('getHeartbeatFeedbackSummary', { periodHours: 0 });
      const p1 = JSON.parse(r1);
      expect(p1.periodHours).toBe(1);

      // 200 → 168 にクランプ
      const r2 = await executeWorkerTool('getHeartbeatFeedbackSummary', { periodHours: 200 });
      const p2 = JSON.parse(r2);
      expect(p2.periodHours).toBe(168);
    });

    it('結果なしで正常に動作する', async () => {
      const result = await executeWorkerTool('getHeartbeatFeedbackSummary', {});
      const parsed = JSON.parse(result);
      expect(parsed.totalResults).toBe(0);
      expect(parsed.taskStats).toEqual([]);
    });
  });

  describe('searchMemoriesByQuery', () => {
    it('キーワードで関連記憶を返す', async () => {
      await saveMemory('A社の予算上限は年間500万', 'context');
      await saveMemory('B社のプロジェクト進行中', 'context');

      const result = await executeWorkerTool('searchMemoriesByQuery', { query: 'A社' });
      const parsed = JSON.parse(result);
      expect(parsed.count).toBeGreaterThan(0);
      expect(parsed.query).toBe('A社');
      expect(parsed.memories[0].content).toContain('A社');
    });

    it('空クエリでエラーを返す', async () => {
      const result = await executeWorkerTool('searchMemoriesByQuery', { query: '' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('query は必須です');
    });

    it('query 未指定でエラーを返す', async () => {
      const result = await executeWorkerTool('searchMemoriesByQuery', {});
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('query は必須です');
    });

    it('limit がクランプされる（1-20）', async () => {
      for (let i = 0; i < 5; i++) {
        await saveMemory(`テスト記憶 ${i}`, 'fact');
      }

      // limit=2 で 2 件のみ
      const r1 = await executeWorkerTool('searchMemoriesByQuery', { query: 'テスト', limit: 2 });
      const p1 = JSON.parse(r1);
      expect(p1.count).toBeLessThanOrEqual(2);

      // limit=0 → 1 にクランプ
      const r2 = await executeWorkerTool('searchMemoriesByQuery', { query: 'テスト', limit: 0 });
      const p2 = JSON.parse(r2);
      expect(p2.count).toBeLessThanOrEqual(1);

      // limit=100 → 20 にクランプ
      const r3 = await executeWorkerTool('searchMemoriesByQuery', { query: 'テスト', limit: 100 });
      const p3 = JSON.parse(r3);
      expect(p3.count).toBeLessThanOrEqual(20);
    });

    it('記憶なしでも正常に動作する', async () => {
      const result = await executeWorkerTool('searchMemoriesByQuery', { query: '存在しないキーワード' });
      const parsed = JSON.parse(result);
      expect(parsed.count).toBe(0);
      expect(parsed.memories).toEqual([]);
    });
  });

  describe('getInfoThresholdStatus', () => {
    it('データなしで全カウント 0、exceeded=false', async () => {
      const result = await executeWorkerTool('getInfoThresholdStatus', {});
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
      expect(parsed.count).toBe(1);
      expect(parsed.reflections[0].content).toBe('今日のふりかえり');
    });

    it('デフォルト periodDays=7', async () => {
      const result = await executeWorkerTool('getWeeklyReflections', {});
      const parsed = JSON.parse(result);
      expect(parsed.periodDays).toBe(7);
    });

    it('periodDays がクランプされる（0→1、60→30）', async () => {
      const r1 = await executeWorkerTool('getWeeklyReflections', { periodDays: 0 });
      const p1 = JSON.parse(r1);
      expect(p1.periodDays).toBe(1);

      const r2 = await executeWorkerTool('getWeeklyReflections', { periodDays: 60 });
      const p2 = JSON.parse(r2);
      expect(p2.periodDays).toBe(30);
    });

    it('reflection なしで空配列', async () => {
      const result = await executeWorkerTool('getWeeklyReflections', {});
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
      expect(parsed.totalTopics).toBe(1);
      expect(parsed.topics[0].sourceCount).toBe(2);
    });

    it('単一ソースはトピックに含まれない（sourceCount < 2 除外）', async () => {
      const feed = await saveFeed({ url: 'https://a.com/feed', title: 'フィードA' });
      await saveFeedItems(feed.id, [
        { guid: 'g1', title: 'React 19 新機能', link: 'https://a.com/react', content: '本文', publishedAt: Date.now() - 1000 },
      ]);

      const result = await executeWorkerTool('getCrossSourceTopics', {});
      const parsed = JSON.parse(result);
      expect(parsed.totalTopics).toBe(0);
      expect(parsed.topics).toEqual([]);
    });

    it('periodDays クランプ（0→1、60→30）', async () => {
      const r1 = await executeWorkerTool('getCrossSourceTopics', { periodDays: 0 });
      const p1 = JSON.parse(r1);
      expect(p1.periodDays).toBe(1);

      const r2 = await executeWorkerTool('getCrossSourceTopics', { periodDays: 60 });
      const p2 = JSON.parse(r2);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
      // skip 記事は除外されるので sourceCount=1 (clip のみ) → トピックに含まれない
      expect(parsed.totalTopics).toBe(0);
    });

    it('データなしで空配列', async () => {
      const result = await executeWorkerTool('getCrossSourceTopics', {});
      const parsed = JSON.parse(result);
      expect(parsed.topics).toEqual([]);
      expect(parsed.totalTopics).toBe(0);
      expect(parsed.periodDays).toBe(7);
    });
  });

  describe('不明なツール', () => {
    it('エラーメッセージを返す', async () => {
      const result = await executeWorkerTool('unknownTool', {});
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('不明なツール');
    });
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
