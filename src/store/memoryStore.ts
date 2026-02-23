import { getDB } from './db';
import type { Memory } from '../types';

const STORE_NAME = 'memories';
const MAX_MEMORIES = 100;

export async function saveMemory(content: string, category: Memory['category']): Promise<Memory> {
  const db = await getDB();
  const now = Date.now();
  const memory: Memory = {
    id: crypto.randomUUID(),
    content,
    category,
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
  const all: Memory[] = await db.getAll(STORE_NAME);
  const lowerQuery = query.toLowerCase();
  return all
    .filter((m) => m.content.toLowerCase().includes(lowerQuery))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listMemories(category?: Memory['category']): Promise<Memory[]> {
  const db = await getDB();
  if (category) {
    const results: Memory[] = await db.getAllFromIndex(STORE_NAME, 'category', category);
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const all: Memory[] = await db.getAll(STORE_NAME);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
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
