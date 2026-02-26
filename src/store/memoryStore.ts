import { getDB } from './db';
import type { Memory, MemoryCategory } from '../types';

const STORE_NAME = 'memories';
const MAX_MEMORIES = 100;

/** 既存データの後方互換: importance/tags が未設定の場合にフォールバック */
export function normalizeMemory(raw: Partial<Memory> & { id: string; content: string; category: string; createdAt: number; updatedAt: number }): Memory {
  return {
    ...raw,
    category: raw.category as MemoryCategory,
    importance: raw.importance ?? 3,
    tags: raw.tags ?? [],
  };
}

export async function saveMemory(
  content: string,
  category: MemoryCategory,
  options?: { importance?: number; tags?: string[] },
): Promise<Memory> {
  const db = await getDB();
  const now = Date.now();
  const importance = Math.max(1, Math.min(5, options?.importance ?? 3));
  const memory: Memory = {
    id: crypto.randomUUID(),
    content,
    category,
    importance,
    tags: options?.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
  // 上限チェック: 古いものから削除
  const all = await db.getAll(STORE_NAME);
  if (all.length >= MAX_MEMORIES) {
    const oldest = [...all].sort((a, b) => a.updatedAt - b.updatedAt)[0];
    await db.delete(STORE_NAME, oldest.id);
  }
  await db.put(STORE_NAME, memory);
  return memory;
}

export async function searchMemories(query: string): Promise<Memory[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  const lowerQuery = query.toLowerCase();
  return (all as Memory[])
    .map(normalizeMemory)
    .filter((m) => m.content.toLowerCase().includes(lowerQuery))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listMemories(category?: MemoryCategory): Promise<Memory[]> {
  const db = await getDB();
  if (category) {
    const results = await db.getAllFromIndex(STORE_NAME, 'category', category);
    return (results as Memory[]).map(normalizeMemory).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const all = await db.getAll(STORE_NAME);
  return (all as Memory[]).map(normalizeMemory).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteMemory(id: string): Promise<boolean> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id);
  if (!existing) return false;
  await db.delete(STORE_NAME, id);
  return true;
}

export async function getRecentMemories(limit: number = 10): Promise<Memory[]> {
  const all = await listMemories();
  return all.slice(0, limit);
}

/** 関連性ベースの記憶取得 */
export async function getRelevantMemories(
  query: string,
  limit: number = 10,
): Promise<Memory[]> {
  const all = await listMemories();
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // クエリをトークン化
  const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);

  // カテゴリボーナス
  const categoryBonus: Record<MemoryCategory, number> = {
    personality: 5,
    routine: 4,
    goal: 3,
    preference: 2,
    fact: 1,
    context: 1,
    other: 0,
  };

  // スコアリング
  const scored = all.map((m) => {
    let score = 0;

    // キーワード一致
    if (queryTokens.length > 0) {
      const lowerContent = m.content.toLowerCase();
      const lowerTags = m.tags.map((t) => t.toLowerCase());
      for (const token of queryTokens) {
        if (lowerContent.includes(token)) score += 3;
        if (lowerTags.some((tag) => tag.includes(token))) score += 2;
      }
    }

    // importance 加算
    score += m.importance;

    // カテゴリボーナス
    score += categoryBonus[m.category] ?? 0;

    // 直近 7 日ボーナス
    if (now - m.updatedAt < sevenDaysMs) score += 1;

    return { memory: m, score };
  });

  // 必須メモリ（personality, routine）を先に抽出
  const mustInclude = scored.filter(
    (s) => s.memory.category === 'personality' || s.memory.category === 'routine',
  );
  const others = scored.filter(
    (s) => s.memory.category !== 'personality' && s.memory.category !== 'routine',
  );

  // スコア降順ソート
  mustInclude.sort((a, b) => b.score - a.score);
  others.sort((a, b) => b.score - a.score);

  // 必須メモリを優先し、残り枠を others から埋める
  const result: Memory[] = [];
  const usedIds = new Set<string>();

  for (const s of mustInclude) {
    if (result.length >= limit) break;
    result.push(s.memory);
    usedIds.add(s.memory.id);
  }

  for (const s of others) {
    if (result.length >= limit) break;
    if (!usedIds.has(s.memory.id)) {
      result.push(s.memory);
    }
  }

  return result;
}
