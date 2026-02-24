import { getDB } from './db';
import type { Conversation } from '../types';

const STORE_NAME = 'conversation-meta';

export async function listConversations(): Promise<Conversation[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return (all as Conversation[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id) as Promise<Conversation | undefined>;
}

export async function createConversation(title?: string): Promise<Conversation> {
  const db = await getDB();
  const now = Date.now();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title: title ?? '新しい会話',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
  await db.put(STORE_NAME, conversation);
  return conversation;
}

export async function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, 'title' | 'updatedAt' | 'messageCount'>>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id) as Conversation | undefined;
  if (!existing) return;
  await db.put(STORE_NAME, { ...existing, ...patch });
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}
