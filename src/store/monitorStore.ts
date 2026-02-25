import { getDB } from './db';
import type { Monitor } from '../types';

const STORE_NAME = 'monitors';
const MAX_MONITORS = 20;
const MAX_TEXT_LENGTH = 10 * 1024; // 10KB

export async function saveMonitor(params: {
  url: string;
  name: string;
  selector?: string;
  lastHash: string;
  lastText: string;
}): Promise<Monitor> {
  const db = await getDB();

  // 件数上限チェック
  const all = await db.getAll(STORE_NAME);
  if (all.length >= MAX_MONITORS) {
    throw new Error(`監視対象の上限（${MAX_MONITORS}件）に達しています`);
  }

  // URL 重複チェック
  const existing = (all as Monitor[]).find((m) => m.url === params.url && m.selector === params.selector);
  if (existing) {
    throw new Error('この URL（とセレクタの組み合わせ）は既に監視中です');
  }

  const now = Date.now();
  const monitor: Monitor = {
    id: crypto.randomUUID(),
    url: params.url,
    name: params.name,
    selector: params.selector,
    lastHash: params.lastHash,
    lastText: params.lastText.slice(0, MAX_TEXT_LENGTH),
    lastCheckedAt: now,
    createdAt: now,
  };

  await db.put(STORE_NAME, monitor);
  return monitor;
}

export async function getMonitor(id: string): Promise<Monitor | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id) as Promise<Monitor | undefined>;
}

export async function listMonitors(): Promise<Monitor[]> {
  const db = await getDB();
  const all: Monitor[] = await db.getAll(STORE_NAME);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateMonitor(id: string, patch: Partial<Monitor>): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id) as Monitor | undefined;
  if (!existing) throw new Error('監視対象が見つかりません');
  await db.put(STORE_NAME, { ...existing, ...patch, id });
}

export async function deleteMonitor(id: string): Promise<boolean> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id);
  if (!existing) return false;
  await db.delete(STORE_NAME, id);
  return true;
}

/** テキストの SHA-256 ハッシュを計算する */
export async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
