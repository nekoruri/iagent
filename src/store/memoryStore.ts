import { getDB } from './db';
import type { Memory, MemoryCategory, ArchivedMemory } from '../types';

const STORE_NAME = 'memories';
const ARCHIVE_STORE_NAME = 'memories_archive';
const MAX_MEMORIES = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

/** カテゴリ別半減期（ミリ秒） */
export const HALF_LIFE_MS: Record<MemoryCategory, number> = {
  personality: 365 * DAY_MS,   // 1年
  routine:     180 * DAY_MS,   // 6ヶ月
  goal:        120 * DAY_MS,   // 4ヶ月
  preference:   90 * DAY_MS,   // 3ヶ月
  reflection:   90 * DAY_MS,   // 3ヶ月
  fact:         60 * DAY_MS,   // 2ヶ月
  context:      30 * DAY_MS,   // 1ヶ月
  other:        14 * DAY_MS,   // 2週間
};

/** SHA-256 ハッシュ計算ヘルパー */
export async function computeContentHash(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 指数減衰スコアを計算する共通関数 */
export function scoreMemory(m: Memory, now: number): number {
  let score = 0;

  // importance 加算
  score += m.importance;

  // カテゴリボーナス
  const categoryBonus: Record<MemoryCategory, number> = {
    personality: 5,
    routine: 4,
    goal: 3,
    preference: 2,
    reflection: 2,
    fact: 1,
    context: 1,
    other: 0,
  };
  score += categoryBonus[m.category] ?? 0;

  // 指数減衰: decay = exp(-ln2 * age / halfLife)
  const age = now - m.updatedAt;
  const halfLife = HALF_LIFE_MS[m.category] ?? HALF_LIFE_MS.other;
  const decay = Math.exp(-Math.LN2 * age / halfLife);
  score += decay * 3;  // 最大 +3（最新時）、半減期で +1.5

  // アクセス頻度ブースト（最大 +100%）
  score *= (1 + 0.1 * Math.min(m.accessCount, 10));

  return score;
}

/** 既存データの後方互換: importance/tags/accessCount 等が未設定の場合にフォールバック */
export function normalizeMemory(raw: Partial<Memory> & { id: string; content: string; category: string; createdAt: number; updatedAt: number }): Memory {
  return {
    ...raw,
    category: raw.category as MemoryCategory,
    importance: raw.importance ?? 3,
    tags: raw.tags ?? [],
    accessCount: raw.accessCount ?? 0,
    lastAccessedAt: raw.lastAccessedAt ?? raw.updatedAt ?? raw.createdAt,
    contentHash: raw.contentHash ?? '',
  };
}

/** アクセスメトリクスを非同期更新 */
async function updateAccessMetrics(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const now = Date.now();
  for (const id of ids) {
    const m = await store.get(id);
    if (m) {
      await store.put({
        ...m,
        accessCount: ((m as Record<string, unknown>).accessCount as number ?? 0) + 1,
        lastAccessedAt: now,
      });
    }
  }
  await tx.done;
}

/** 品質ベースのアーカイブ: 最低スコアの記憶を memories_archive に移動 */
export async function archiveLowestScored(db: Awaited<ReturnType<typeof getDB>>, all: Memory[]): Promise<void> {
  const now = Date.now();
  // personality, routine は保護（アーカイブしない）
  const candidates = all.filter(
    (m) => m.category !== 'personality' && m.category !== 'routine',
  );
  if (candidates.length === 0) {
    // 保護カテゴリのみで飽和: 全メモリから最低スコアをアーカイブ（安全弁）
    console.warn('[Memory] 保護カテゴリのみで MAX_MEMORIES 到達。最低スコアの記憶をアーカイブします。');
    const allScored = all.map((m) => ({ memory: m, score: scoreMemory(m, now) }));
    allScored.sort((a, b) => a.score - b.score);
    const target = allScored[0].memory;
    const archived: ArchivedMemory = { ...normalizeMemory(target), archivedAt: now, archiveReason: 'low-score' };
    const tx = db.transaction([STORE_NAME, ARCHIVE_STORE_NAME], 'readwrite');
    await tx.objectStore(ARCHIVE_STORE_NAME).put(archived);
    await tx.objectStore(STORE_NAME).delete(target.id);
    await tx.done;
    return;
  }

  // 減衰スコアで最低スコアの記憶を特定
  const scored = candidates.map((m) => ({
    memory: m,
    score: scoreMemory(m, now),
  }));
  scored.sort((a, b) => a.score - b.score);
  const target = scored[0].memory;

  // memories_archive に移動
  const archived: ArchivedMemory = {
    ...normalizeMemory(target),
    archivedAt: now,
    archiveReason: 'low-score',
  };
  const tx = db.transaction([STORE_NAME, ARCHIVE_STORE_NAME], 'readwrite');
  await tx.objectStore(ARCHIVE_STORE_NAME).put(archived);
  await tx.objectStore(STORE_NAME).delete(target.id);
  await tx.done;
}

export async function saveMemory(
  content: string,
  category: MemoryCategory,
  options?: { importance?: number; tags?: string[] },
): Promise<Memory> {
  const db = await getDB();
  const now = Date.now();
  const importance = Math.max(1, Math.min(5, options?.importance ?? 3));

  // コンテンツハッシュを計算
  const contentHash = await computeContentHash(content);

  // 重複チェック: 同一ハッシュの既存メモリがあれば updatedAt のみ更新
  const all = await db.getAll(STORE_NAME);
  const existing = (all as Memory[]).find((m) => m.contentHash === contentHash);
  if (existing) {
    const updated: Memory = {
      ...normalizeMemory(existing),
      updatedAt: now,
      importance: Math.max(existing.importance ?? 3, importance),
      tags: [...new Set([...(existing.tags ?? []), ...(options?.tags ?? [])])],
    };
    await db.put(STORE_NAME, updated);
    return updated;
  }

  const memory: Memory = {
    id: crypto.randomUUID(),
    content,
    category,
    importance,
    tags: options?.tags ?? [],
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    lastAccessedAt: now,
    contentHash,
  };

  // 上限チェック: 品質ベースアーカイブ
  const normalized = (all as Memory[]).map(normalizeMemory);
  if (normalized.length >= MAX_MEMORIES) {
    await archiveLowestScored(db, normalized);
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

export interface UpdateMemoryInput {
  content?: string;
  importance?: number;
  tags?: string[];
}

/** 記憶を編集（内容/重要度/タグ） */
export async function updateMemory(id: string, patch: UpdateMemoryInput): Promise<Memory | null> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id);
  if (!existing) return null;

  const current = normalizeMemory(existing as Memory);
  const now = Date.now();
  const hasContent = typeof patch.content === 'string';
  const nextContent = hasContent ? patch.content!.trim() : current.content;
  if (!nextContent) return null;

  const nextImportance = typeof patch.importance === 'number'
    ? Math.max(1, Math.min(5, Math.floor(patch.importance)))
    : current.importance;
  const nextTags = Array.isArray(patch.tags)
    ? [...new Set(patch.tags.map((t) => t.trim()).filter((t) => t.length > 0))]
    : current.tags;

  const nextHash = hasContent
    ? await computeContentHash(nextContent)
    : current.contentHash;

  // 編集後コンテンツが別 ID と重複する場合は統合
  if (nextHash && nextHash !== current.contentHash) {
    const all = (await db.getAll(STORE_NAME) as Memory[]).map(normalizeMemory);
    const duplicate = all.find((m) => m.id !== id && m.contentHash === nextHash);
    if (duplicate) {
      const mergedAccessCount = (duplicate.accessCount ?? 0) + (current.accessCount ?? 0) + 1;
      const mergedLastAccessedAt = Math.max(
        now,
        duplicate.lastAccessedAt ?? 0,
        current.lastAccessedAt ?? 0,
      );
      const merged: Memory = {
        ...duplicate,
        updatedAt: now,
        lastAccessedAt: mergedLastAccessedAt,
        accessCount: mergedAccessCount,
        importance: Math.max(duplicate.importance, nextImportance),
        tags: [...new Set([...duplicate.tags, ...nextTags])],
      };
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await tx.store.put(merged);
      await tx.store.delete(id);
      await tx.done;
      return merged;
    }
  }

  const updated: Memory = {
    ...current,
    content: nextContent,
    importance: nextImportance,
    tags: nextTags,
    updatedAt: now,
    lastAccessedAt: now,
    accessCount: (current.accessCount ?? 0) + 1,
    contentHash: nextHash,
  };
  await db.put(STORE_NAME, updated);
  return updated;
}

/** 記憶を手動で無効化（アーカイブへ移動） */
export async function archiveMemory(
  id: string,
  reason: ArchivedMemory['archiveReason'] = 'manual',
): Promise<boolean> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id);
  if (!existing) return false;
  const memory = normalizeMemory(existing as Memory);
  const now = Date.now();
  const archived: ArchivedMemory = {
    ...memory,
    archivedAt: now,
    archiveReason: reason,
  };
  const tx = db.transaction([STORE_NAME, ARCHIVE_STORE_NAME], 'readwrite');
  await tx.objectStore(ARCHIVE_STORE_NAME).put(archived);
  await tx.objectStore(STORE_NAME).delete(id);
  await tx.done;
  return true;
}

export interface ReevaluateCandidateOptions {
  minStaleDays?: number;
  maxImportance?: number;
  limit?: number;
  sourceMemories?: Memory[];
}

/** 長期間未参照かつ低重要度の記憶を再評価候補として抽出 */
export async function listMemoryReevaluationCandidates(
  options?: ReevaluateCandidateOptions,
): Promise<Memory[]> {
  const minStaleDays = Math.max(1, Math.floor(options?.minStaleDays ?? 14));
  const maxImportance = Math.max(1, Math.min(5, Math.floor(options?.maxImportance ?? 2)));
  const limit = Math.max(1, Math.min(100, Math.floor(options?.limit ?? 20)));
  const staleMs = minStaleDays * DAY_MS;
  const now = Date.now();

  const all = options?.sourceMemories ?? await listMemories();
  const candidates = all.filter((m) => {
    if (m.category === 'personality' || m.category === 'routine') return false;
    if (m.importance > maxImportance) return false;
    return now - m.lastAccessedAt >= staleMs;
  });

  return candidates
    .sort((a, b) => {
      const staleA = now - a.lastAccessedAt;
      const staleB = now - b.lastAccessedAt;
      if (staleA !== staleB) return staleB - staleA;
      if (a.importance !== b.importance) return a.importance - b.importance;
      return a.updatedAt - b.updatedAt;
    })
    .slice(0, limit);
}

export async function getRecentMemories(limit: number = 10): Promise<Memory[]> {
  const all = await listMemories();
  return all.slice(0, limit);
}

/** 関連性ベースの記憶取得（指数減衰スコアリング） */
export async function getRelevantMemories(
  query: string,
  limit: number = 10,
): Promise<Memory[]> {
  const all = await listMemories();
  const now = Date.now();

  // クエリをトークン化
  const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);

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

    // 共通スコアリング関数で指数減衰 + importance + カテゴリボーナス + アクセス頻度を加算
    score += scoreMemory(m, now);

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

  // 返却する記憶のアクセス情報を非同期更新（non-blocking）
  updateAccessMetrics(result.map((m) => m.id)).catch(() => {});

  return result;
}

/** ブリーフィング用の記憶取得（goal/context を含む拡張版） */
export async function getMemoriesForBriefing(limit: number = 15): Promise<Memory[]> {
  const all = await listMemories();
  const now = Date.now();

  // スコアリング
  const scored = all.map((m) => ({
    memory: m,
    score: scoreMemory(m, now),
  }));

  // mustInclude: personality, routine, goal を先に抽出
  const mustInclude = scored.filter(
    (s) => s.memory.category === 'personality'
      || s.memory.category === 'routine'
      || s.memory.category === 'goal',
  );
  const contextItems = scored.filter((s) => s.memory.category === 'context');
  const others = scored.filter(
    (s) => s.memory.category !== 'personality'
      && s.memory.category !== 'routine'
      && s.memory.category !== 'goal'
      && s.memory.category !== 'context',
  );

  // スコア降順ソート
  mustInclude.sort((a, b) => b.score - a.score);
  contextItems.sort((a, b) => b.score - a.score);
  others.sort((a, b) => b.score - a.score);

  // context が存在する場合は 1 枠予約し、mustInclude の上限を調整
  const hasContext = contextItems.length > 0;
  const mustIncludeLimit = hasContext ? limit - 1 : limit;

  // 必須メモリを優先し、context を最低1件確保、残り枠を others から埋める
  const result: Memory[] = [];
  const usedIds = new Set<string>();

  for (const s of mustInclude) {
    if (result.length >= mustIncludeLimit) break;
    result.push(s.memory);
    usedIds.add(s.memory.id);
  }

  // context カテゴリから最低 1 件を確保（あれば）
  if (hasContext && result.length < limit) {
    result.push(contextItems[0].memory);
    usedIds.add(contextItems[0].memory.id);
  }

  // 残り枠を others + 残りの context から埋める
  const remainingContext = contextItems.filter((s) => !usedIds.has(s.memory.id));
  const remaining = [...remainingContext, ...others].sort((a, b) => b.score - a.score);

  for (const s of remaining) {
    if (result.length >= limit) break;
    if (!usedIds.has(s.memory.id)) {
      result.push(s.memory);
      usedIds.add(s.memory.id);
    }
  }

  // アクセスメトリクス更新（non-blocking）
  updateAccessMetrics(result.map((m) => m.id)).catch(() => {});

  return result;
}

/** アーカイブ記憶を復元（memories_archive → memories） */
export async function restoreArchivedMemory(id: string): Promise<boolean> {
  const db = await getDB();

  // 存在確認
  const archived = await db.get(ARCHIVE_STORE_NAME, id);
  if (!archived) return false;

  // archivedAt / archiveReason を除去して Memory に戻す
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { archivedAt: _at, archiveReason: _reason, ...memory } = archived as ArchivedMemory;
  const now = Date.now();
  const restored: Memory = normalizeMemory({
    ...memory,
    updatedAt: now,
  });

  // 重複チェック: 同一 contentHash のアクティブ記憶がある場合はマージ
  const all = await db.getAll(STORE_NAME);
  const normalized = (all as Memory[]).map(normalizeMemory);
  const duplicate = restored.contentHash
    ? normalized.find((m) => m.contentHash === restored.contentHash)
    : undefined;

  if (duplicate) {
    // 既存記憶を更新（importance は最大値、tags はマージ）してアーカイブだけ削除
    const merged: Memory = {
      ...duplicate,
      updatedAt: now,
      importance: Math.max(duplicate.importance, restored.importance),
      tags: [...new Set([...duplicate.tags, ...restored.tags])],
    };
    const tx = db.transaction([STORE_NAME, ARCHIVE_STORE_NAME], 'readwrite');
    await tx.objectStore(STORE_NAME).put(merged);
    await tx.objectStore(ARCHIVE_STORE_NAME).delete(id);
    await tx.done;
    return true;
  }

  // MAX_MEMORIES 上限チェック: 上限に達している場合は先にアーカイブ
  if (normalized.length >= MAX_MEMORIES) {
    await archiveLowestScored(db, normalized);
  }

  const tx = db.transaction([STORE_NAME, ARCHIVE_STORE_NAME], 'readwrite');
  await tx.objectStore(STORE_NAME).put(restored);
  await tx.objectStore(ARCHIVE_STORE_NAME).delete(id);
  await tx.done;
  return true;
}

/** アーカイブ記憶を完全削除 */
export async function deleteArchivedMemory(id: string): Promise<boolean> {
  const db = await getDB();
  const existing = await db.get(ARCHIVE_STORE_NAME, id);
  if (!existing) return false;
  await db.delete(ARCHIVE_STORE_NAME, id);
  return true;
}

/** アーカイブ済み記憶の一覧を取得 */
export async function listArchivedMemories(category?: MemoryCategory): Promise<ArchivedMemory[]> {
  const db = await getDB();
  if (category) {
    const results = await db.getAllFromIndex(ARCHIVE_STORE_NAME, 'category', category);
    return (results as ArchivedMemory[]).sort((a, b) => b.archivedAt - a.archivedAt);
  }
  const all = await db.getAll(ARCHIVE_STORE_NAME);
  return (all as ArchivedMemory[]).sort((a, b) => b.archivedAt - a.archivedAt);
}

/** 直近 24 時間の記憶 + アクセス上位の記憶を取得（ふりかえり用） */
export async function getRecentMemoriesForReflection(): Promise<{ recent: Memory[]; topAccessed: Memory[] }> {
  const all = await listMemories();
  const now = Date.now();
  const oneDayAgo = now - DAY_MS;

  const recent = all.filter((m) => m.updatedAt >= oneDayAgo);

  const topAccessed = [...all]
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 10);

  return { recent, topAccessed };
}

/** 低スコア記憶の一括アーカイブ（ふりかえりクリーンアップ用） */
export async function cleanupLowScoredMemories(count: number = 5): Promise<number> {
  const db = await getDB();
  let archived = 0;
  for (let i = 0; i < count; i++) {
    const all = await db.getAll(STORE_NAME);
    const normalized = (all as Memory[]).map(normalizeMemory);
    const candidates = normalized.filter(
      (m) => m.category !== 'personality' && m.category !== 'routine',
    );
    if (candidates.length === 0) break;
    await archiveLowestScored(db, normalized);
    archived++;
  }
  return archived;
}
