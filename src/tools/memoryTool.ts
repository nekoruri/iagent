import { tool } from '@openai/agents';
import { z } from 'zod';
import {
  saveMemory,
  searchMemories,
  listMemories,
  deleteMemory,
  updateMemory,
  archiveMemory,
  listMemoryReevaluationCandidates,
} from '../store/memoryStore';
import type { MemoryCategory } from '../types';

const validCategories: MemoryCategory[] = ['preference', 'fact', 'context', 'routine', 'goal', 'personality', 'reflection', 'other'];
const validCategoryLabel = validCategories.join('/');

function parseMemoryCategory(category: string): MemoryCategory | null {
  return validCategories.includes(category as MemoryCategory)
    ? (category as MemoryCategory)
    : null;
}

export const memoryTool = tool({
  name: 'memory',
  description: `長期メモリを管理します。ユーザーの好み・重要な情報・文脈を保存し、後から参照できます。
action:
- "save": メモリを保存。content（内容）と category を指定。importance（1-5）と tags（カンマ区切り）はオプション。
- "search": キーワードでメモリを検索。query を指定。
- "list": メモリ一覧を取得。category で絞り込み可能（空文字で全件）。
- "update": 既存メモリを更新。id を指定し、content/importance/tags を必要に応じて更新。
- "archive": 既存メモリを手動無効化（アーカイブ）。id を指定。
- "reevaluate": 再評価候補（低重要度かつ長期間未参照）を取得。minStaleDays/maxImportance は任意。
- "delete": メモリを削除。id を指定。

category:
- preference: ユーザーの好み・嗜好（例: 「コーヒーが好き」）
- fact: 事実情報（例: 「東京在住」）
- context: 文脈・状況（例: 「プロジェクトXに取り組み中」）
- routine: ユーザーの日課・習慣（例: 「毎朝7時にニュース確認」）
- goal: ユーザーの目標（例: 「3月末までにレポート提出」）
- personality: エージェントの振る舞い指示（例: 「敬語で話して」）
- reflection: 振り返りで得た洞察やパターン
- other: その他`,
  parameters: z.object({
    action: z.enum(['save', 'search', 'list', 'update', 'archive', 'reevaluate', 'delete']),
    content: z.string().describe('保存/更新するメモリの内容。未使用時は空文字。save 時は必須'),
    category: z.string().describe('カテゴリ（preference/fact/context/routine/goal/personality/reflection/other）。未使用時は空文字。save 時に必須、list 時はフィルタ用'),
    query: z.string().describe('検索キーワード。未使用時は空文字。search 時に必須'),
    id: z.string().describe('対象メモリID。未使用時は空文字。update/archive/delete 時に必須'),
    importance: z.string().describe('重要度（1-5）。未使用時は空文字。save/update 時に有効'),
    tags: z.string().describe('タグ（カンマ区切り）。未使用時は空文字。save/update 時に有効。空文字でクリア'),
    minStaleDays: z.string().describe('再評価候補の最小未参照日数。未使用時は空文字。reevaluate 時のみ有効'),
    maxImportance: z.string().describe('再評価候補の最大重要度。未使用時は空文字。reevaluate 時のみ有効'),
  }),
  execute: async ({ action, content, category, query, id, importance, tags, minStaleDays, maxImportance }) => {
    if (action === 'save') {
      if (!content) return JSON.stringify({ error: 'content は必須です' });
      const cat = parseMemoryCategory(category);
      if (!cat) {
        return JSON.stringify({ error: `category は ${validCategoryLabel} のいずれかを指定してください` });
      }
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
      if (category && !parseMemoryCategory(category)) {
        return JSON.stringify({ error: `category は ${validCategoryLabel} のいずれか、または空文字を指定してください` });
      }
      const cat = category ? parseMemoryCategory(category) ?? undefined : undefined;
      const memories = await listMemories(cat);
      return JSON.stringify({ memories, count: memories.length });
    }

    if (action === 'update') {
      if (!id) return JSON.stringify({ error: 'id は必須です' });
      const patch: { content?: string; importance?: number; tags?: string[] } = {};
      if (typeof content === 'string' && content.trim().length === 0 && content.length > 0) {
        return JSON.stringify({ error: 'content は空白のみを指定できません' });
      }
      if (typeof content === 'string' && content.trim().length > 0) {
        patch.content = content;
      }
      if (importance) {
        const parsed = parseInt(importance, 10);
        if (!isNaN(parsed)) patch.importance = parsed;
      }
      if (tags !== undefined) {
        if (tags === '') {
          patch.tags = [];
        } else {
          patch.tags = tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
        }
      }
      const updated = await updateMemory(id, patch);
      return JSON.stringify(
        updated
          ? { message: 'メモリを更新しました', memory: updated }
          : { message: 'メモリが見つかりません' },
      );
    }

    if (action === 'archive') {
      if (!id) return JSON.stringify({ error: 'id は必須です' });
      const archived = await archiveMemory(id, 'manual');
      return JSON.stringify({ message: archived ? '無効化しました' : 'メモリが見つかりません' });
    }

    if (action === 'reevaluate') {
      const stale = typeof minStaleDays === 'string' ? parseInt(minStaleDays, 10) : NaN;
      const maxImp = typeof maxImportance === 'string' ? parseInt(maxImportance, 10) : NaN;
      const candidates = await listMemoryReevaluationCandidates({
        ...(Number.isFinite(stale) ? { minStaleDays: stale } : {}),
        ...(Number.isFinite(maxImp) ? { maxImportance: maxImp } : {}),
      });
      return JSON.stringify({ candidates, count: candidates.length });
    }

    if (action === 'delete') {
      if (!id) return JSON.stringify({ error: 'id は必須です' });
      const deleted = await deleteMemory(id);
      return JSON.stringify({ message: deleted ? '削除しました' : 'メモリが見つかりません' });
    }

    return JSON.stringify({ error: '不明なアクションです' });
  },
});
