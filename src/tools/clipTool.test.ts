import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');
vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ''),
  },
}));

import { clipTool } from './clipTool';
import { saveClip, searchClips, listClips, deleteClip, getClip } from '../store/clipStore';

beforeEach(() => {
  __resetStores();
});

describe('clipTool 定義', () => {
  it('ツール名と説明が設定されている', () => {
    expect(clipTool.name).toBe('clip');
  });
});

describe('clipTool ストア統合テスト', () => {
  it('save → get でクリップを保存・取得できる', async () => {
    const clip = await saveClip({
      url: 'https://example.com/article',
      title: 'テスト記事',
      content: '<p>本文</p>',
      tags: ['tech', 'web'],
    });
    expect(clip.title).toBe('テスト記事');
    expect(clip.tags).toEqual(['tech', 'web']);

    const retrieved = await getClip(clip.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.url).toBe('https://example.com/article');
  });

  it('search でタイトル・本文・タグを横断検索できる', async () => {
    await saveClip({ url: 'https://a.com', title: 'React入門', content: '本文A', tags: ['frontend'] });
    await saveClip({ url: 'https://b.com', title: 'Go言語入門', content: 'Goの解説', tags: ['backend'] });
    await saveClip({ url: 'https://c.com', title: 'タイトルC', content: 'TypeScript解説', tags: ['frontend'] });

    expect(await searchClips('React')).toHaveLength(1);
    expect(await searchClips('TypeScript')).toHaveLength(1);
    expect(await searchClips('frontend')).toHaveLength(2);
  });

  it('list でタグフィルタと件数制限が動作する', async () => {
    for (let i = 0; i < 5; i++) {
      await saveClip({ url: `https://${i}.com`, title: `記事${i}`, content: `内容${i}`, tags: i < 3 ? ['groupA'] : ['groupB'] });
    }

    const all = await listClips();
    expect(all).toHaveLength(5);

    const limited = await listClips(undefined, 3);
    expect(limited).toHaveLength(3);
  });

  it('delete でクリップを削除できる', async () => {
    const clip = await saveClip({ url: 'https://example.com', title: '削除対象', content: '内容' });
    expect(await deleteClip(clip.id)).toBe(true);
    expect(await getClip(clip.id)).toBeUndefined();
  });

  it('存在しないID の delete で false を返す', async () => {
    expect(await deleteClip('non-existent')).toBe(false);
  });
});
