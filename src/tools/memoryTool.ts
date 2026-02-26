import { tool } from '@openai/agents';
import { z } from 'zod';
import { saveMemory, searchMemories, listMemories, deleteMemory } from '../store/memoryStore';
import type { MemoryCategory } from '../types';

const validCategories: MemoryCategory[] = ['preference', 'fact', 'context', 'routine', 'goal', 'personality', 'other'];

export const memoryTool = tool({
  name: 'memory',
  description: `長期メモリを管理します。ユーザーの好み・重要な情報・文脈を保存し、後から参照できます。
action:
- "save": メモリを保存。content（内容）と category を指定。importance（1-5）と tags（カンマ区切り）はオプション。
- "search": キーワードでメモリを検索。query を指定。
- "list": メモリ一覧を取得。category で絞り込み可能（空文字で全件）。
- "delete": メモリを削除。id を指定。

category:
- preference: ユーザーの好み・嗜好（例: 「コーヒーが好き」）
- fact: 事実情報（例: 「東京在住」）
- context: 文脈・状況（例: 「プロジェクトXに取り組み中」）
- routine: ユーザーの日課・習慣（例: 「毎朝7時にニュース確認」）
- goal: ユーザーの目標（例: 「3月末までにレポート提出」）
- personality: エージェントの振る舞い指示（例: 「敬語で話して」）
- other: その他`,
  parameters: z.object({
    action: z.enum(['save', 'search', 'list', 'delete']),
    content: z.string().describe('保存するメモリの内容。save 時に必須、他は空文字'),
    category: z.string().describe('カテゴリ（preference/fact/context/routine/goal/personality/other）。save 時に必須、list 時はフィルタ用、他は空文字'),
    query: z.string().describe('検索キーワード。search 時に必須、他は空文字'),
    id: z.string().describe('削除対象のメモリID。delete 時に必須、他は空文字'),
    importance: z.string().optional().describe('重要度（1-5）。save 時のみ有効、省略時はデフォルト 3'),
    tags: z.string().optional().describe('タグ（カンマ区切り）。save 時のみ有効、省略時は空'),
  }),
  execute: async ({ action, content, category, query, id, importance, tags }) => {
    if (action === 'save') {
      if (!content) return JSON.stringify({ error: 'content は必須です' });
      const cat: MemoryCategory = validCategories.includes(category as MemoryCategory)
        ? (category as MemoryCategory)
        : 'other';
      const options: { importance?: number; tags?: string[] } = {};
      if (importance) {
        const parsed = parseInt(importance, 10);
        if (!isNaN(parsed)) options.importance = parsed;
      }
      if (tags) {
        options.tags = tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
      }
      const memory = await saveMemory(content, cat, options);
      return JSON.stringify({ message: 'メモリを保存しました', memory });
    }

    if (action === 'search') {
      if (!query) return JSON.stringify({ error: 'query は必須です' });
      const results = await searchMemories(query);
      return JSON.stringify({ results, count: results.length });
    }

    if (action === 'list') {
      const cat: MemoryCategory | undefined = validCategories.includes(category as MemoryCategory)
        ? (category as MemoryCategory)
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
