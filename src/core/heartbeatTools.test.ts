import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { WORKER_TOOLS, executeWorkerTool } from './heartbeatTools';
import { getDB } from '../store/db';
import { saveMemory } from '../store/memoryStore';

beforeEach(() => {
  __resetStores();
});

describe('WORKER_TOOLS', () => {
  it('全 Worker ツールが定義されている', () => {
    expect(WORKER_TOOLS).toHaveLength(8);
    const names = WORKER_TOOLS.map((t) => t.function.name);
    expect(names).toContain('listCalendarEvents');
    expect(names).toContain('getCurrentTime');
    expect(names).toContain('fetchFeeds');
    expect(names).toContain('listFeeds');
    expect(names).toContain('checkMonitors');
    expect(names).toContain('getRecentMemoriesForReflection');
    expect(names).toContain('saveReflection');
    expect(names).toContain('cleanupMemories');
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

  describe('不明なツール', () => {
    it('エラーメッセージを返す', async () => {
      const result = await executeWorkerTool('unknownTool', {});
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('不明なツール');
    });
  });
});
