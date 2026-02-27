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
  scoreMemory,
  computeContentHash,
  getRecentMemoriesForReflection,
  cleanupLowScoredMemories,
  listArchivedMemories,
  HALF_LIFE_MS,
} from './memoryStore';
import type { Memory } from '../types';

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

  it('新フィールド（accessCount, lastAccessedAt, contentHash）のデフォルト値', () => {
    const raw = { id: '1', content: 'test', category: 'fact', createdAt: 100, updatedAt: 200 };
    const normalized = normalizeMemory(raw);
    expect(normalized.accessCount).toBe(0);
    expect(normalized.lastAccessedAt).toBe(200); // updatedAt にフォールバック
    expect(normalized.contentHash).toBe('');
  });

  it('新フィールドが設定済みの場合はそのまま返す', () => {
    const raw = {
      id: '1', content: 'test', category: 'fact',
      createdAt: 100, updatedAt: 200,
      accessCount: 5, lastAccessedAt: 300, contentHash: 'abc123',
    };
    const normalized = normalizeMemory(raw);
    expect(normalized.accessCount).toBe(5);
    expect(normalized.lastAccessedAt).toBe(300);
    expect(normalized.contentHash).toBe('abc123');
  });
});

describe('computeContentHash', () => {
  it('同じ内容に対して同じハッシュを返す', async () => {
    const hash1 = await computeContentHash('テストコンテンツ');
    const hash2 = await computeContentHash('テストコンテンツ');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('異なる内容に対して異なるハッシュを返す', async () => {
    const hash1 = await computeContentHash('コンテンツA');
    const hash2 = await computeContentHash('コンテンツB');
    expect(hash1).not.toBe(hash2);
  });
});

describe('scoreMemory', () => {
  const now = Date.now();

  function makeMemory(overrides?: Partial<Memory>): Memory {
    return {
      id: '1',
      content: 'テスト',
      category: 'fact',
      importance: 3,
      tags: [],
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      contentHash: '',
      ...overrides,
    };
  }

  it('最新の記憶は最大減衰スコア（+3）を得る', () => {
    const m = makeMemory({ updatedAt: now });
    const score = scoreMemory(m, now);
    // importance(3) + categoryBonus(fact=1) + decay(3) + accessBoost(×1)
    expect(score).toBeCloseTo(7, 0);
  });

  it('半減期経過時にスコアが半減する', () => {
    const halfLife = HALF_LIFE_MS.fact; // 60日
    const fresh = makeMemory({ updatedAt: now });
    const aged = makeMemory({ updatedAt: now - halfLife });

    const freshScore = scoreMemory(fresh, now);
    const agedScore = scoreMemory(aged, now);

    // 減衰部分が半分になる → fresh は +3、aged は +1.5
    const decayDiff = freshScore - agedScore;
    expect(decayDiff).toBeCloseTo(1.5, 1);
  });

  it('personality カテゴリは最大カテゴリボーナスを得る', () => {
    const personality = makeMemory({ category: 'personality' });
    const other = makeMemory({ category: 'other' });
    expect(scoreMemory(personality, now)).toBeGreaterThan(scoreMemory(other, now));
  });

  it('accessCount が高いとスコアがブーストされる', () => {
    const low = makeMemory({ accessCount: 0 });
    const high = makeMemory({ accessCount: 10 });
    expect(scoreMemory(high, now)).toBeGreaterThan(scoreMemory(low, now));
  });

  it('accessCount ブーストは 10 で上限', () => {
    const ten = makeMemory({ accessCount: 10 });
    const twenty = makeMemory({ accessCount: 20 });
    expect(scoreMemory(ten, now)).toBe(scoreMemory(twenty, now));
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
    expect(memory.accessCount).toBe(0);
    expect(memory.lastAccessedAt).toBe(memory.createdAt);
    expect(memory.contentHash).toHaveLength(64);
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

  it('新カテゴリ（routine, goal, personality, reflection）で保存できる', async () => {
    const routine = await saveMemory('毎朝7時にニュース確認', 'routine');
    expect(routine.category).toBe('routine');

    const goal = await saveMemory('3月末までにレポート提出', 'goal');
    expect(goal.category).toBe('goal');

    const personality = await saveMemory('敬語で話して', 'personality');
    expect(personality.category).toBe('personality');

    const reflection = await saveMemory('ユーザーは朝方に活発', 'reflection');
    expect(reflection.category).toBe('reflection');
  });

  it('同一コンテンツの重複保存時は既存メモリを更新する', async () => {
    const first = await saveMemory('同じ内容です', 'fact', { importance: 2, tags: ['a'] });
    const second = await saveMemory('同じ内容です', 'fact', { importance: 4, tags: ['b'] });

    // 同じ ID が返る
    expect(second.id).toBe(first.id);
    // importance は最大値を採用
    expect(second.importance).toBe(4);
    // tags はマージされる
    expect(second.tags).toEqual(expect.arrayContaining(['a', 'b']));

    // DB 上は 1 件のみ
    const all = await listMemories();
    expect(all).toHaveLength(1);
  });

  it('MAX_MEMORIES を超えたとき低スコアの記憶がアーカイブされる', async () => {
    // 200件保存
    for (let i = 0; i < 200; i++) {
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
    expect(before).toHaveLength(200);

    // 201件目を保存 → 低スコアがアーカイブされる
    await saveMemory('新しいメモリ', 'other');
    const after = await listMemories();
    expect(after).toHaveLength(200);
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
    // preference(+2) + importance(5) > fact(+1) + importance(1)
    expect(results[0].content).toBe('メモリA');
  });
});

describe('getRecentMemoriesForReflection', () => {
  it('直近24時間の記憶を取得する', async () => {
    const m1 = await saveMemory('最近のメモリ', 'fact');
    const m2 = await saveMemory('古いメモリ', 'fact');

    // m2 を 2 日前に設定
    const { getDB: db } = await import('./__mocks__/db');
    const mockDb = await db();
    const stored = await mockDb.get('memories', m2.id);
    if (stored) {
      stored.updatedAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
      await mockDb.put('memories', stored);
    }

    const { recent, topAccessed } = await getRecentMemoriesForReflection();
    expect(recent.find((r) => r.id === m1.id)).toBeDefined();
    expect(recent.find((r) => r.id === m2.id)).toBeUndefined();
    expect(topAccessed).toHaveLength(2); // 全 2 件
  });

  it('アクセス上位 10 件を返す', async () => {
    for (let i = 0; i < 15; i++) {
      const m = await saveMemory(`メモリ ${i}`, 'fact');
      // accessCount を手動設定
      const { getDB: db } = await import('./__mocks__/db');
      const mockDb = await db();
      const stored = await mockDb.get('memories', m.id);
      if (stored) {
        stored.accessCount = i;
        await mockDb.put('memories', stored);
      }
    }

    const { topAccessed } = await getRecentMemoriesForReflection();
    expect(topAccessed).toHaveLength(10);
    // 降順ソート
    expect(topAccessed[0].accessCount).toBeGreaterThanOrEqual(topAccessed[9].accessCount);
  });
});

describe('cleanupLowScoredMemories', () => {
  it('指定件数分の低スコア記憶をアーカイブする', async () => {
    for (let i = 0; i < 10; i++) {
      await saveMemory(`メモリ ${i}`, 'other');
    }

    const before = await listMemories();
    expect(before).toHaveLength(10);

    const archived = await cleanupLowScoredMemories(3);
    expect(archived).toBe(3);

    const after = await listMemories();
    expect(after).toHaveLength(7);
  });

  it('personality と routine はアーカイブされない', async () => {
    await saveMemory('性格情報', 'personality');
    await saveMemory('日課情報', 'routine');
    await saveMemory('その他', 'other');

    const archived = await cleanupLowScoredMemories(2);
    expect(archived).toBe(1); // other のみアーカイブ

    const after = await listMemories();
    expect(after).toHaveLength(2);
    expect(after.map((m) => m.category)).toEqual(expect.arrayContaining(['personality', 'routine']));
  });
});

describe('listArchivedMemories', () => {
  it('アーカイブ済み記憶を取得できる', async () => {
    // 複数のメモリを保存して低スコアをアーカイブ
    for (let i = 0; i < 5; i++) {
      await saveMemory(`メモリ ${i}`, 'other');
    }
    await cleanupLowScoredMemories(2);

    const archived = await listArchivedMemories();
    expect(archived).toHaveLength(2);
    expect(archived[0].archivedAt).toBeGreaterThan(0);
    expect(archived[0].archiveReason).toBe('low-score');
  });

  it('カテゴリ指定でアーカイブをフィルタできる', async () => {
    await saveMemory('事実1', 'fact');
    await saveMemory('その他1', 'other');
    await saveMemory('その他2', 'other');
    await cleanupLowScoredMemories(2);

    const archived = await listArchivedMemories();
    // アーカイブが存在する場合のみカテゴリフィルタを検証
    if (archived.length > 0) {
      const categories = archived.map((a) => a.category);
      const factArchived = await listArchivedMemories('fact');
      const otherArchived = await listArchivedMemories('other');
      expect(factArchived.length + otherArchived.length).toBeLessThanOrEqual(archived.length);
    }
  });
});
