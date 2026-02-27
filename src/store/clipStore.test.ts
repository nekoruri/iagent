import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');
vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ''),
  },
}));

import {
  saveClip,
  getClip,
  searchClips,
  listClips,
  deleteClip,
} from './clipStore';

beforeEach(() => {
  __resetStores();
});

describe('saveClip', () => {
  it('クリップを保存して返却値を検証する', async () => {
    const clip = await saveClip({
      url: 'https://example.com/article',
      title: 'テスト記事',
      content: '<p>本文テスト</p>',
      tags: ['tech', 'test'],
    });
    expect(clip.id).toBeDefined();
    expect(clip.url).toBe('https://example.com/article');
    expect(clip.title).toBe('テスト記事');
    expect(clip.content).toBe('<p>本文テスト</p>');
    expect(clip.tags).toEqual(['tech', 'test']);
    expect(clip.createdAt).toBeGreaterThan(0);
  });

  it('タグ省略時は空配列になる', async () => {
    const clip = await saveClip({
      url: 'https://example.com',
      title: 'タイトル',
      content: '本文',
    });
    expect(clip.tags).toEqual([]);
  });

  it('script タグがサニタイズされる', async () => {
    const clip = await saveClip({
      url: 'https://example.com',
      title: 'XSS テスト',
      content: '<p>安全</p><script>alert("xss")</script>',
    });
    expect(clip.content).not.toContain('<script>');
    expect(clip.content).toContain('<p>安全</p>');
  });

  it('MAX_CLIPS を超えたとき最古が削除される', async () => {
    // 500件保存
    for (let i = 0; i < 500; i++) {
      const c = await saveClip({
        url: `https://example.com/${i}`,
        title: `記事 ${i}`,
        content: `内容 ${i}`,
      });
      // createdAt を手動で設定して順序を保証
      const { getDB: db } = await import('./__mocks__/db');
      const mockDb = await db();
      const stored = await mockDb.get('clips', c.id);
      if (stored) {
        (stored as Record<string, unknown>).createdAt = i;
        await mockDb.put('clips', stored);
      }
    }

    const before = await listClips();
    expect(before).toHaveLength(500);

    // 501件目を保存 → 最古が削除される
    await saveClip({
      url: 'https://example.com/new',
      title: '新しい記事',
      content: '新しい内容',
    });
    const after = await listClips();
    expect(after).toHaveLength(500);
    expect(after.find((c) => c.title === '新しい記事')).toBeDefined();
  });
});

describe('getClip', () => {
  it('保存したクリップを取得できる', async () => {
    const saved = await saveClip({
      url: 'https://example.com',
      title: 'テスト',
      content: '内容',
    });
    const retrieved = await getClip(saved.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe('テスト');
  });

  it('存在しないIDで undefined を返す', async () => {
    const result = await getClip('non-existent');
    expect(result).toBeUndefined();
  });
});

describe('searchClips', () => {
  it('タイトルにマッチするクリップを返す', async () => {
    await saveClip({ url: 'https://a.com', title: 'React入門', content: '本文A' });
    await saveClip({ url: 'https://b.com', title: 'Vue.js入門', content: '本文B' });

    const results = await searchClips('React');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('React入門');
  });

  it('本文にマッチするクリップを返す', async () => {
    await saveClip({ url: 'https://a.com', title: 'タイトルA', content: 'TypeScript の解説' });
    await saveClip({ url: 'https://b.com', title: 'タイトルB', content: 'JavaScript の解説' });

    const results = await searchClips('typescript');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('TypeScript');
  });

  it('タグにマッチするクリップを返す', async () => {
    await saveClip({ url: 'https://a.com', title: 'A', content: 'A', tags: ['frontend'] });
    await saveClip({ url: 'https://b.com', title: 'B', content: 'B', tags: ['backend'] });

    const results = await searchClips('frontend');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('A');
  });
});

describe('listClips', () => {
  it('全件取得し createdAt 降順で返す', async () => {
    const c1 = await saveClip({ url: 'https://a.com', title: 'A', content: 'A' });
    const c2 = await saveClip({ url: 'https://b.com', title: 'B', content: 'B' });

    // createdAt を手動設定
    const { getDB: db } = await import('./__mocks__/db');
    const mockDb = await db();
    const s1 = await mockDb.get('clips', c1.id);
    const s2 = await mockDb.get('clips', c2.id);
    (s1 as Record<string, unknown>).createdAt = 1000;
    (s2 as Record<string, unknown>).createdAt = 2000;
    await mockDb.put('clips', s1!);
    await mockDb.put('clips', s2!);

    const all = await listClips();
    expect(all).toHaveLength(2);
    expect(all[0].title).toBe('B');
    expect(all[1].title).toBe('A');
  });

  it('タグフィルタで該当クリップのみ返す（multiEntry 対応）', async () => {
    await saveClip({ url: 'https://a.com', title: 'A', content: 'A', tags: ['frontend', 'react'] });
    await saveClip({ url: 'https://b.com', title: 'B', content: 'B', tags: ['backend', 'node'] });
    await saveClip({ url: 'https://c.com', title: 'C', content: 'C', tags: ['frontend', 'vue'] });

    // 'frontend' タグで検索 → A, C がヒット
    const frontend = await listClips('frontend');
    expect(frontend).toHaveLength(2);
    expect(frontend.map((c) => c.title).sort()).toEqual(['A', 'C']);

    // 'react' タグで検索 → A のみヒット
    const react = await listClips('react');
    expect(react).toHaveLength(1);
    expect(react[0].title).toBe('A');

    // 'backend' タグで検索 → B のみヒット（frontend タグのクリップは含まれない）
    const backend = await listClips('backend');
    expect(backend).toHaveLength(1);
    expect(backend[0].title).toBe('B');
  });

  it('limit で件数制限できる', async () => {
    for (let i = 0; i < 5; i++) {
      await saveClip({ url: `https://${i}.com`, title: `記事${i}`, content: `内容${i}` });
    }
    const limited = await listClips(undefined, 3);
    expect(limited).toHaveLength(3);
  });
});

describe('deleteClip', () => {
  it('存在するクリップを削除できる', async () => {
    const clip = await saveClip({ url: 'https://example.com', title: '削除対象', content: '内容' });
    const result = await deleteClip(clip.id);
    expect(result).toBe(true);

    const all = await listClips();
    expect(all).toHaveLength(0);
  });

  it('存在しないIDで false を返す', async () => {
    const result = await deleteClip('non-existent-id');
    expect(result).toBe(false);
  });
});
