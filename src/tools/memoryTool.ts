import { tool } from '@openai/agents';
import { z } from 'zod';
import { saveMemory, searchMemories, listMemories, deleteMemory } from '../store/memoryStore';

export const memoryTool = tool({
  name: 'memory',
  description: `長期メモリを管理します。ユーザーの好み・重要な情報・文脈を保存し、後から参照できます。
action:
- "save": メモリを保存。content（内容）と category（preference/fact/context/other）を指定。
- "search": キーワードでメモリを検索。query を指定。
- "list": メモリ一覧を取得。category で絞り込み可能（空文字で全件）。
- "delete": メモリを削除。id を指定。`,
  parameters: z.object({
    action: z.enum(['save', 'search', 'list', 'delete']),
    content: z.string().describe('保存するメモリの内容。save 時に必須、他は空文字'),
    category: z.string().describe('カテゴリ（preference/fact/context/other）。save 時に必須、list 時はフィルタ用、他は空文字'),
    query: z.string().describe('検索キーワード。search 時に必須、他は空文字'),
    id: z.string().describe('削除対象のメモリID。delete 時に必須、他は空文字'),
  }),
  execute: async ({ action, content, category, query, id }) => {
    if (action === 'save') {
      if (!content) return JSON.stringify({ error: 'content は必須です' });
      const validCategories = ['preference', 'fact', 'context', 'other'] as const;
      const cat = validCategories.includes(category as typeof validCategories[number])
        ? (category as typeof validCategories[number])
        : 'other';
      const memory = await saveMemory(content, cat);
      return JSON.stringify({ message: 'メモリを保存しました', memory });
    }

    if (action === 'search') {
      if (!query) return JSON.stringify({ error: 'query は必須です' });
      const results = await searchMemories(query);
      return JSON.stringify({ results, count: results.length });
    }

    if (action === 'list') {
      const validCategories = ['preference', 'fact', 'context', 'other'] as const;
      const cat = validCategories.includes(category as typeof validCategories[number])
        ? (category as typeof validCategories[number])
        : undefined;
      const memories = await listMemories(cat);
      return JSON.stringify({ memories, count: memories.length });
    }

    if (action === 'delete') {
      if (!id) return JSON.stringify({ error: 'id は必須です' });
      const deleted = await deleteMemory(id);
      return JSON.stringify({ message: deleted ? '削除しました' : 'メモリが見つかりません' });
    }

    return JSON.stringify({ error: '不明なアクションです' });
  },
});
