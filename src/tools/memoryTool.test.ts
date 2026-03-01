import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { memoryTool } from './memoryTool';
import { listMemories } from '../store/memoryStore';

const base = { content: '', category: '', query: '', id: '', importance: '', tags: '' };

/** ツールを呼び出すヘルパー */
async function invoke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await memoryTool.invoke({}, JSON.stringify(params));
  return JSON.parse(result);
}

beforeEach(() => {
  __resetStores();
});

describe('memoryTool 定義', () => {
  it('ツール名が設定されている', () => {
    expect(memoryTool.name).toBe('memory');
  });
});

describe('memoryTool invoke', () => {
  // --- save ---
  describe('action: save', () => {
    it('content と category でメモリを保存する', async () => {
      const parsed = await invoke({ ...base, action: 'save', content: 'コーヒーが好き', category: 'preference' });
      expect(parsed.message).toBe('メモリを保存しました');
      const memory = parsed.memory as Record<string, unknown>;
      expect(memory.content).toBe('コーヒーが好き');
      expect(memory.category).toBe('preference');
    });

    it('content が空の場合はエラーを返す', async () => {
      const parsed = await invoke({ ...base, action: 'save', content: '', category: 'fact' });
      expect(parsed.error).toBe('content は必須です');
    });

    it('無効な category は "other" にフォールバックする', async () => {
      const parsed = await invoke({ ...base, action: 'save', content: 'テスト', category: 'invalid-category' });
      expect((parsed.memory as Record<string, unknown>).category).toBe('other');
    });

    it('importance を数値としてパースする', async () => {
      const parsed = await invoke({ ...base, action: 'save', content: '重要', category: 'fact', importance: '5' });
      expect((parsed.memory as Record<string, unknown>).importance).toBe(5);
    });

    it('importance が数値でない場合は無視する', async () => {
      const parsed = await invoke({ ...base, action: 'save', content: 'テスト', category: 'fact', importance: 'abc' });
      expect(parsed.memory).toBeDefined();
    });

    it('tags をカンマ区切りで分割する', async () => {
      const parsed = await invoke({ ...base, action: 'save', content: 'テスト', category: 'fact', tags: 'tech, web, AI' });
      expect((parsed.memory as Record<string, unknown>).tags).toEqual(['tech', 'web', 'AI']);
    });

    it('tags の空要素は除外する', async () => {
      const parsed = await invoke({ ...base, action: 'save', content: 'テスト', category: 'fact', tags: 'a,,b, ,c' });
      expect((parsed.memory as Record<string, unknown>).tags).toEqual(['a', 'b', 'c']);
    });

    it('全カテゴリが有効に設定される', async () => {
      const categories = ['preference', 'fact', 'context', 'routine', 'goal', 'personality', 'reflection', 'other'];
      for (const cat of categories) {
        __resetStores();
        const parsed = await invoke({ ...base, action: 'save', content: `テスト-${cat}`, category: cat });
        expect((parsed.memory as Record<string, unknown>).category).toBe(cat);
      }
    });
  });

  // --- search ---
  describe('action: search', () => {
    it('query でメモリを検索する', async () => {
      await invoke({ ...base, action: 'save', content: 'React入門', category: 'fact' });
      await invoke({ ...base, action: 'save', content: 'Go言語', category: 'fact' });

      const parsed = await invoke({ ...base, action: 'search', query: 'React' });
      expect(parsed.results).toHaveLength(1);
      expect(parsed.count).toBe(1);
    });

    it('query が空の場合はエラーを返す', async () => {
      const parsed = await invoke({ ...base, action: 'search', query: '' });
      expect(parsed.error).toBe('query は必須です');
    });
  });

  // --- list ---
  describe('action: list', () => {
    it('category で絞り込む', async () => {
      await invoke({ ...base, action: 'save', content: 'A', category: 'fact' });
      await invoke({ ...base, action: 'save', content: 'B', category: 'preference' });

      const parsed = await invoke({ ...base, action: 'list', category: 'fact' });
      expect(parsed.count).toBe(1);
      expect(((parsed.memories as Record<string, unknown>[])[0]).category).toBe('fact');
    });

    it('category が空文字の場合は全件返す', async () => {
      await invoke({ ...base, action: 'save', content: 'A', category: 'fact' });
      await invoke({ ...base, action: 'save', content: 'B', category: 'preference' });

      const parsed = await invoke({ ...base, action: 'list', category: '' });
      expect(parsed.count).toBe(2);
    });

    it('無効な category は全件扱いになる', async () => {
      await invoke({ ...base, action: 'save', content: 'A', category: 'fact' });

      const parsed = await invoke({ ...base, action: 'list', category: 'nonexistent' });
      expect(parsed.count).toBe(1);
    });
  });

  // --- delete ---
  describe('action: delete', () => {
    it('id を指定してメモリを削除する', async () => {
      const saveResult = await invoke({ ...base, action: 'save', content: '削除対象', category: 'fact' });
      const id = (saveResult.memory as Record<string, unknown>).id;

      const parsed = await invoke({ ...base, action: 'delete', id });
      expect(parsed.message).toBe('削除しました');
    });

    it('存在しない id の場合はメッセージを返す', async () => {
      const parsed = await invoke({ ...base, action: 'delete', id: 'non-existent' });
      expect(parsed.message).toBe('メモリが見つかりません');
    });

    it('id が空の場合はエラーを返す', async () => {
      const parsed = await invoke({ ...base, action: 'delete', id: '' });
      expect(parsed.error).toBe('id は必須です');
    });
  });

  // --- DB 連携 ---
  describe('DB 連携', () => {
    it('save → list でメモリが永続化されていることを確認', async () => {
      await invoke({ ...base, action: 'save', content: '永続化テスト', category: 'goal' });
      const memories = await listMemories('goal');
      expect(memories).toHaveLength(1);
      expect(memories[0].content).toBe('永続化テスト');
    });
  });
});
