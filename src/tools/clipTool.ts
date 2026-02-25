import { tool } from '@openai/agents';
import { z } from 'zod';
import { saveClip, searchClips, listClips, deleteClip, getClip } from '../store/clipStore';

export const clipTool = tool({
  name: 'clip',
  description: `Webページや情報をクリップ（構造化保存）します。保存・検索・一覧・削除ができます。
action:
- "save": URLと内容をクリップ保存。url, title, content は必須。tags はカンマ区切り（省略可）。
- "search": キーワードでクリップを検索。query を指定。
- "list": クリップ一覧を取得。tag で絞り込み可能（空文字で全件）。limit で件数制限。
- "get": IDを指定してクリップを1件取得。id を指定。
- "delete": クリップを削除。id を指定。`,
  parameters: z.object({
    action: z.enum(['save', 'search', 'list', 'get', 'delete']),
    url: z.string().describe('クリップするURL。save 時に必須、他は空文字'),
    title: z.string().describe('クリップのタイトル。save 時に必須、他は空文字'),
    content: z.string().describe('クリップする内容。save 時に必須、他は空文字'),
    tags: z.string().describe('タグ（カンマ区切り）。save 時に任意、他は空文字'),
    query: z.string().describe('検索キーワード。search 時に必須、他は空文字'),
    id: z.string().describe('クリップID。get/delete 時に必須、他は空文字'),
    tag: z.string().describe('一覧フィルタ用タグ。list 時に任意、他は空文字'),
    limit: z.string().describe('一覧取得件数上限。list 時に任意、他は空文字'),
  }),
  execute: async ({ action, url, title, content, tags, query, id, tag, limit }) => {
    if (action === 'save') {
      if (!url || !title || !content) {
        return JSON.stringify({ error: 'url, title, content は必須です' });
      }
      try {
        const tagList = tags ? tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0) : [];
        const clip = await saveClip({ url, title, content, tags: tagList });
        return JSON.stringify({ message: 'クリップを保存しました', clip: { id: clip.id, title: clip.title, url: clip.url, tags: clip.tags } });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : 'クリップの保存に失敗しました' });
      }
    }

    if (action === 'search') {
      if (!query) return JSON.stringify({ error: 'query は必須です' });
      const results = await searchClips(query);
      return JSON.stringify({
        results: results.map((c) => ({ id: c.id, title: c.title, url: c.url, tags: c.tags, createdAt: c.createdAt })),
        count: results.length,
      });
    }

    if (action === 'list') {
      const limitNum = limit ? parseInt(limit, 10) : undefined;
      const results = await listClips(tag || undefined, limitNum);
      return JSON.stringify({
        clips: results.map((c) => ({ id: c.id, title: c.title, url: c.url, tags: c.tags, createdAt: c.createdAt })),
        count: results.length,
      });
    }

    if (action === 'get') {
      if (!id) return JSON.stringify({ error: 'id は必須です' });
      const clip = await getClip(id);
      if (!clip) return JSON.stringify({ error: 'クリップが見つかりません' });
      return JSON.stringify({ clip });
    }

    if (action === 'delete') {
      if (!id) return JSON.stringify({ error: 'id は必須です' });
      const deleted = await deleteClip(id);
      return JSON.stringify({ message: deleted ? '削除しました' : 'クリップが見つかりません' });
    }

    return JSON.stringify({ error: '不明なアクションです' });
  },
});
