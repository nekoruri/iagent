import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { calendarTool } from './calendarTool';
import { listEvents, createEvent } from '../store/calendarStore';

/** ツールを呼び出すヘルパー */
async function invoke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await calendarTool.invoke({}, JSON.stringify(params));
  return JSON.parse(result);
}

beforeEach(() => {
  __resetStores();
});

describe('calendarTool 定義', () => {
  it('ツール名が設定されている', () => {
    expect(calendarTool.name).toBe('calendar');
  });
});

describe('calendarTool invoke', () => {
  // --- list アクション ---
  describe('action: list', () => {
    it('予定がない場合はメッセージと空配列を返す', async () => {
      const parsed = await invoke({ action: 'list', date: '', title: '', time: '', description: '' });
      expect(parsed.message).toBe('予定はありません');
      expect(parsed.events).toEqual([]);
    });

    it('日付指定で予定がない場合は日付入りメッセージを返す', async () => {
      const parsed = await invoke({ action: 'list', date: '2026-03-01', title: '', time: '', description: '' });
      expect(parsed.message).toBe('2026-03-01 の予定はありません');
    });

    it('予定がある場合は events 配列を返す', async () => {
      await createEvent({ title: '会議', date: '2026-03-01' });
      await createEvent({ title: 'ランチ', date: '2026-03-01' });

      const parsed = await invoke({ action: 'list', date: '2026-03-01', title: '', time: '', description: '' });
      expect(parsed.events).toHaveLength(2);
      expect(parsed.message).toBeUndefined();
    });

    it('日付未指定で全件返す', async () => {
      await createEvent({ title: 'A', date: '2026-03-01' });
      await createEvent({ title: 'B', date: '2026-03-02' });

      const parsed = await invoke({ action: 'list', date: '', title: '', time: '', description: '' });
      expect(parsed.events).toHaveLength(2);
    });
  });

  // --- create / create_reminder アクション ---
  describe('action: create', () => {
    it('title と date があれば予定を作成する', async () => {
      const parsed = await invoke({ action: 'create', date: '2026-03-10', title: 'MTG', time: '14:00', description: '定例' });
      expect(parsed.message).toBe('予定を作成しました');
      expect((parsed.event as Record<string, unknown>).title).toBe('MTG');
      expect((parsed.event as Record<string, unknown>).date).toBe('2026-03-10');
      expect((parsed.event as Record<string, unknown>).time).toBe('14:00');
    });

    it('title がない場合はエラーを返す', async () => {
      const parsed = await invoke({ action: 'create', date: '2026-03-10', title: '', time: '', description: '' });
      expect(parsed.error).toBe('title と date は必須です');
    });

    it('date がない場合はエラーを返す', async () => {
      const parsed = await invoke({ action: 'create', date: '', title: 'MTG', time: '', description: '' });
      expect(parsed.error).toBe('title と date は必須です');
    });

    it('time と description が空文字の場合は undefined として保存する', async () => {
      const parsed = await invoke({ action: 'create', date: '2026-03-10', title: 'MTG', time: '', description: '' });
      const event = parsed.event as Record<string, unknown>;
      expect(event.time).toBeUndefined();
      expect(event.description).toBeUndefined();
    });
  });

  describe('action: create_reminder', () => {
    it('リマインダーとして作成される', async () => {
      const parsed = await invoke({ action: 'create_reminder', date: '2026-03-10', title: '薬を飲む', time: '08:00', description: '' });
      expect(parsed.message).toBe('リマインダーを作成しました');
      expect((parsed.event as Record<string, unknown>).isReminder).toBe(true);
    });
  });

  // --- DB 連携確認 ---
  describe('DB 連携', () => {
    it('create した予定を list で取得できる', async () => {
      await invoke({ action: 'create', date: '2026-04-01', title: 'テスト予定', time: '', description: '' });

      const events = await listEvents('2026-04-01');
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('テスト予定');
    });
  });
});
