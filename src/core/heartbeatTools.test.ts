import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { WORKER_TOOLS, executeWorkerTool } from './heartbeatTools';
import { getDB } from '../store/db';

beforeEach(() => {
  __resetStores();
});

describe('WORKER_TOOLS', () => {
  it('全 Worker ツールが定義されている', () => {
    expect(WORKER_TOOLS).toHaveLength(5);
    const names = WORKER_TOOLS.map((t) => t.function.name);
    expect(names).toContain('listCalendarEvents');
    expect(names).toContain('getCurrentTime');
    expect(names).toContain('fetchFeeds');
    expect(names).toContain('listFeeds');
    expect(names).toContain('checkMonitors');
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

  describe('不明なツール', () => {
    it('エラーメッセージを返す', async () => {
      const result = await executeWorkerTool('unknownTool', {});
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('不明なツール');
    });
  });
});
