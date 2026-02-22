import { getDB } from './db';
import type { ChatMessage } from '../types';

const STORE_NAME = 'conversations';

export async function loadMessages(): Promise<ChatMessage[]> {
  const db = await getDB();
  const messages = await db.getAll(STORE_NAME);
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

export async function saveMessage(message: ChatMessage): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, message);
}

export async function clearMessages(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}
