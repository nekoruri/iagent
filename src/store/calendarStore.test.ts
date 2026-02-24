import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import { listEvents, createEvent, deleteEvent } from './calendarStore';

beforeEach(() => {
  __resetStores();
});

describe('listEvents', () => {
  it('イベントなしで空配列を返す', async () => {
    const events = await listEvents();
    expect(events).toEqual([]);
  });

  it('複数イベントを全件返す', async () => {
    await createEvent({ title: 'ミーティング', date: '2026-02-25' });
    await createEvent({ title: 'ランチ', date: '2026-02-26' });

    const events = await listEvents();
    expect(events).toHaveLength(2);
  });

  it('日付指定で該当イベントのみ返す', async () => {
    await createEvent({ title: 'ミーティング', date: '2026-02-25' });
    await createEvent({ title: 'ランチ', date: '2026-02-26' });

    const events = await listEvents('2026-02-25');
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('ミーティング');
  });

  it('該当日なしで空配列を返す', async () => {
    await createEvent({ title: 'ミーティング', date: '2026-02-25' });

    const events = await listEvents('2026-03-01');
    expect(events).toEqual([]);
  });
});

describe('createEvent', () => {
  it('id, createdAt が自動付与される', async () => {
    const event = await createEvent({ title: '会議', date: '2026-02-25' });
    expect(event.id).toBeDefined();
    expect(typeof event.id).toBe('string');
    expect(event.createdAt).toBeDefined();
    expect(typeof event.createdAt).toBe('number');
  });

  it('作成後に listEvents で取得できる', async () => {
    const created = await createEvent({ title: '打合せ', date: '2026-02-25' });

    const events = await listEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(created.id);
    expect(events[0].title).toBe('打合せ');
  });

  it('optional フィールド（time, description）なしで動作する', async () => {
    const event = await createEvent({ title: '終日イベント', date: '2026-02-25' });
    expect(event.time).toBeUndefined();
    expect(event.description).toBeUndefined();
    expect(event.title).toBe('終日イベント');
  });
});

describe('deleteEvent', () => {
  it('存在するイベントを削除し true を返す', async () => {
    const event = await createEvent({ title: '削除対象', date: '2026-02-25' });

    const result = await deleteEvent(event.id);
    expect(result).toBe(true);

    const events = await listEvents();
    expect(events).toHaveLength(0);
  });

  it('存在しないIDで false を返す', async () => {
    const result = await deleteEvent('non-existent-id');
    expect(result).toBe(false);
  });
});
