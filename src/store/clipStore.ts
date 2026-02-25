import { getDB } from './db';
import type { Clip } from '../types';
import DOMPurify from 'dompurify';

const STORE_NAME = 'clips';
const MAX_CLIPS = 500;
const MAX_CLIP_SIZE = 100 * 1024; // 100KB

export async function saveClip(params: {
  url: string;
  title: string;
  content: string;
  tags?: string[];
}): Promise<Clip> {
  const db = await getDB();

  // コンテンツをサニタイズ
  const sanitized = DOMPurify.sanitize(params.content);

  // サイズ上限チェック
  if (new Blob([sanitized]).size > MAX_CLIP_SIZE) {
    throw new Error(`クリップのサイズが上限（${MAX_CLIP_SIZE / 1024}KB）を超えています`);
  }

  // 件数上限チェック: 古いものから削除
  const all = await db.getAll(STORE_NAME);
  if (all.length >= MAX_CLIPS) {
    const sorted = [...all].sort(
      (a, b) => (a as Clip).createdAt - (b as Clip).createdAt,
    );
    await db.delete(STORE_NAME, (sorted[0] as Clip).id);
  }

  const clip: Clip = {
    id: crypto.randomUUID(),
    url: params.url,
    title: params.title,
    content: sanitized,
    tags: params.tags ?? [],
    createdAt: Date.now(),
  };

  await db.put(STORE_NAME, clip);
  return clip;
}

export async function getClip(id: string): Promise<Clip | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id) as Promise<Clip | undefined>;
}

export async function searchClips(query: string): Promise<Clip[]> {
  const db = await getDB();
  const all: Clip[] = await db.getAll(STORE_NAME);
  const lowerQuery = query.toLowerCase();
  return all
    .filter(
      (c) =>
        c.title.toLowerCase().includes(lowerQuery) ||
        c.content.toLowerCase().includes(lowerQuery) ||
        c.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listClips(tag?: string, limit?: number): Promise<Clip[]> {
  const db = await getDB();
  let results: Clip[];

  if (tag) {
    results = (await db.getAllFromIndex(STORE_NAME, 'tags', tag)) as Clip[];
  } else {
    results = (await db.getAll(STORE_NAME)) as Clip[];
  }

  results.sort((a, b) => b.createdAt - a.createdAt);

  if (limit && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}

export async function deleteClip(id: string): Promise<boolean> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id);
  if (!existing) return false;
  await db.delete(STORE_NAME, id);
  return true;
}
