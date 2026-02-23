import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import {
  saveMemory,
  searchMemories,
  listMemories,
  deleteMemory,
  getRecentMemories,
} from './memoryStore';

beforeEach(() => {
  __resetStores();
});

describe('saveMemory', () => {
  it('メモリを保存して返却値を検証する', async () => {
    const memory = await saveMemory('ユーザーは東京在住', 'fact');
    expect(memory.id).toBeDefined();
    expect(memory.content).toBe('ユーザーは東京在住');
    expect(memory.category).toBe('fact');
    expect(memory.createdAt).toBeGreaterThan(0);
    expect(memory.updatedAt).toBe(memory.createdAt);
  });

  it('MAX_MEMORIES を超えたとき最古が削除される', async () => {
    // 100件保存
    for (let i = 0; i < 100; i++) {
      const m = await saveMemory(`メモリ ${i}`, 'other');
      // updatedAt を手動で設定して順序を保証
      const db = (await import('./__mocks__/db')).getDB;
      const mockDb = await db();
      const stored = await mockDb.get('memories', m.id);
      if (stored) {
        stored.updatedAt = i;
        await mockDb.put('memories', stored);
      }
    }

    const before = await listMemories();
    expect(before).toHaveLength(100);

    // 101件目を保存 → 最古が削除される
    await saveMemory('新しいメモリ', 'other');
    const after = await listMemories();
    expect(after).toHaveLength(100);
    expect(after.find((m) => m.content === '新しいメモリ')).toBeDefined();
  });
});

describe('searchMemories', () => {
  it('キーワードに一致するメモリのみ返す', async () => {
    await saveMemory('ユーザーは東京在住', 'fact');
    await saveMemory('朝にニュースを確認したい', 'preference');
    await saveMemory('プロジェクトXの締切は3月末', 'context');

    const results = await searchMemories('東京');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('ユーザーは東京在住');
  });

  it('大文字小文字を区別しない', async () => {
    await saveMemory('React is preferred', 'preference');
    await saveMemory('Vue is also used', 'preference');

    const results = await searchMemories('react');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('React is preferred');
  });
});

describe('listMemories', () => {
  it('全件取得し updatedAt 降順で返す', async () => {
    const m1 = await saveMemory('メモリ1', 'fact');
    const m2 = await saveMemory('メモリ2', 'preference');
    const m3 = await saveMemory('メモリ3', 'context');

    // updatedAt を手動設定
    const { getDB: db } = await import('./__mocks__/db');
    const mockDb = await db();
    const s1 = await mockDb.get('memories', m1.id);
    const s2 = await mockDb.get('memories', m2.id);
    const s3 = await mockDb.get('memories', m3.id);
    s1!.updatedAt = 1000;
    s2!.updatedAt = 3000;
    s3!.updatedAt = 2000;
    await mockDb.put('memories', s1!);
    await mockDb.put('memories', s2!);
    await mockDb.put('memories', s3!);

    const all = await listMemories();
    expect(all).toHaveLength(3);
    expect(all[0].content).toBe('メモリ2');
    expect(all[1].content).toBe('メモリ3');
    expect(all[2].content).toBe('メモリ1');
  });

  it('カテゴリ指定で絞り込みできる', async () => {
    await saveMemory('好みA', 'preference');
    await saveMemory('事実B', 'fact');
    await saveMemory('好みC', 'preference');

    const prefs = await listMemories('preference');
    expect(prefs).toHaveLength(2);
    prefs.forEach((m) => expect(m.category).toBe('preference'));
  });
});

describe('deleteMemory', () => {
  it('存在するメモリを削除できる', async () => {
    const memory = await saveMemory('削除対象', 'other');
    const result = await deleteMemory(memory.id);
    expect(result).toBe(true);

    const all = await listMemories();
    expect(all).toHaveLength(0);
  });

  it('存在しないIDで false を返す', async () => {
    const result = await deleteMemory('non-existent-id');
    expect(result).toBe(false);
  });
});

describe('getRecentMemories', () => {
  it('limit 件数の制限が効く', async () => {
    for (let i = 0; i < 5; i++) {
      await saveMemory(`メモリ ${i}`, 'other');
    }

    const recent = await getRecentMemories(3);
    expect(recent).toHaveLength(3);
  });

  it('デフォルトで最大10件返す', async () => {
    for (let i = 0; i < 15; i++) {
      await saveMemory(`メモリ ${i}`, 'other');
    }

    const recent = await getRecentMemories();
    expect(recent).toHaveLength(10);
  });
});
