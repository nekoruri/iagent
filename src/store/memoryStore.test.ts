import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import {
  saveMemory,
  searchMemories,
  listMemories,
  deleteMemory,
  getRecentMemories,
  getRelevantMemories,
  normalizeMemory,
} from './memoryStore';

beforeEach(() => {
  __resetStores();
});

describe('normalizeMemory', () => {
  it('importance/tags が未設定の場合にデフォルト値を付与する', () => {
    const raw = { id: '1', content: 'test', category: 'fact', createdAt: 100, updatedAt: 100 };
    const normalized = normalizeMemory(raw);
    expect(normalized.importance).toBe(3);
    expect(normalized.tags).toEqual([]);
  });

  it('importance/tags が設定済みの場合はそのまま返す', () => {
    const raw = { id: '1', content: 'test', category: 'fact', importance: 5, tags: ['a'], createdAt: 100, updatedAt: 100 };
    const normalized = normalizeMemory(raw);
    expect(normalized.importance).toBe(5);
    expect(normalized.tags).toEqual(['a']);
  });
});

describe('saveMemory', () => {
  it('メモリを保存して返却値を検証する', async () => {
    const memory = await saveMemory('ユーザーは東京在住', 'fact');
    expect(memory.id).toBeDefined();
    expect(memory.content).toBe('ユーザーは東京在住');
    expect(memory.category).toBe('fact');
    expect(memory.importance).toBe(3);
    expect(memory.tags).toEqual([]);
    expect(memory.createdAt).toBeGreaterThan(0);
    expect(memory.updatedAt).toBe(memory.createdAt);
  });

  it('importance を指定して保存できる', async () => {
    const memory = await saveMemory('重要な事実', 'fact', { importance: 5 });
    expect(memory.importance).toBe(5);
  });

  it('tags を指定して保存できる', async () => {
    const memory = await saveMemory('タグ付きメモリ', 'preference', { tags: ['tokyo', 'weather'] });
    expect(memory.tags).toEqual(['tokyo', 'weather']);
  });

  it('importance の範囲外はクランプされる', async () => {
    const low = await saveMemory('低すぎ', 'other', { importance: 0 });
    expect(low.importance).toBe(1);
    const high = await saveMemory('高すぎ', 'other', { importance: 10 });
    expect(high.importance).toBe(5);
  });

  it('importance 省略時にデフォルト 3', async () => {
    const memory = await saveMemory('デフォルト', 'other');
    expect(memory.importance).toBe(3);
  });

  it('tags 省略時に空配列', async () => {
    const memory = await saveMemory('タグなし', 'other');
    expect(memory.tags).toEqual([]);
  });

  it('新カテゴリ（routine, goal, personality）で保存できる', async () => {
    const routine = await saveMemory('毎朝7時にニュース確認', 'routine');
    expect(routine.category).toBe('routine');

    const goal = await saveMemory('3月末までにレポート提出', 'goal');
    expect(goal.category).toBe('goal');

    const personality = await saveMemory('敬語で話して', 'personality');
    expect(personality.category).toBe('personality');
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

  it('検索結果に normalizeMemory が適用される', async () => {
    await saveMemory('テスト', 'fact');
    const results = await searchMemories('テスト');
    expect(results[0].importance).toBe(3);
    expect(results[0].tags).toEqual([]);
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

describe('getRelevantMemories', () => {
  it('personality と routine カテゴリを常に含む', async () => {
    await saveMemory('通常のメモリ1', 'fact', { importance: 5 });
    await saveMemory('通常のメモリ2', 'fact', { importance: 5 });
    await saveMemory('通常のメモリ3', 'fact', { importance: 5 });
    await saveMemory('敬語で話して', 'personality');
    await saveMemory('毎朝7時にニュース確認', 'routine');

    const results = await getRelevantMemories('', 5);
    const categories = results.map((m) => m.category);
    expect(categories).toContain('personality');
    expect(categories).toContain('routine');
  });

  it('キーワード一致でスコアリングする', async () => {
    await saveMemory('東京の天気は晴れ', 'fact');
    await saveMemory('大阪のグルメ情報', 'fact');
    await saveMemory('横浜のイベント', 'fact');

    const results = await getRelevantMemories('東京', 2);
    expect(results[0].content).toContain('東京');
  });

  it('importance の高いメモリを優先する', async () => {
    await saveMemory('低重要度', 'fact', { importance: 1 });
    await saveMemory('高重要度', 'fact', { importance: 5 });

    const results = await getRelevantMemories('', 2);
    expect(results[0].content).toBe('高重要度');
  });

  it('tags 一致でスコアが上がる', async () => {
    await saveMemory('タグなし', 'fact', { importance: 3 });
    await saveMemory('タグあり', 'fact', { importance: 3, tags: ['東京'] });

    const results = await getRelevantMemories('東京', 2);
    expect(results[0].content).toBe('タグあり');
  });

  it('limit を超えない', async () => {
    for (let i = 0; i < 20; i++) {
      await saveMemory(`メモリ ${i}`, 'fact');
    }

    const results = await getRelevantMemories('', 5);
    expect(results).toHaveLength(5);
  });

  it('メモリ 0 件でもエラーにならない', async () => {
    const results = await getRelevantMemories('テスト', 10);
    expect(results).toEqual([]);
  });

  it('空クエリでもスコアリングが動作する', async () => {
    await saveMemory('メモリA', 'preference', { importance: 5 });
    await saveMemory('メモリB', 'fact', { importance: 1 });

    const results = await getRelevantMemories('', 2);
    // preference(+2) + importance(5) = 7 > fact(+1) + importance(1) = 2
    expect(results[0].content).toBe('メモリA');
  });
});
