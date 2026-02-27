import { getDB } from './db';
import { createConversation } from './conversationMetaStore';
import type { ChatMessage } from '../types';

const STORE_NAME = 'conversations';

export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
  const db = await getDB();
  const messages = await db.getAllFromIndex(STORE_NAME, 'conversationId', conversationId);
  return (messages as ChatMessage[]).sort((a, b) => a.timestamp - b.timestamp);
}

export async function saveMessage(message: ChatMessage): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, message);
}

export async function clearMessages(conversationId: string): Promise<void> {
  const db = await getDB();
  const messages = await db.getAllFromIndex(STORE_NAME, 'conversationId', conversationId);
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const msg of messages) {
    tx.store.delete((msg as ChatMessage).id);
  }
  await tx.done;
}

/**
 * conversationId 未設定の既存メッセージをデフォルト会話に紐付ける。
 * マイグレーション対象がなければ null を返す。
 */
export async function migrateOrphanMessages(): Promise<string | null> {
  const db = await getDB();
  const allMessages = await db.getAll(STORE_NAME) as ChatMessage[];
  const orphans = allMessages.filter((m) => !m.conversationId);

  if (orphans.length === 0) return null;

  const firstMsg = orphans.reduce((a, b) => (a.timestamp < b.timestamp ? a : b));
  const title = firstMsg.role === 'user'
    ? firstMsg.content.slice(0, 30)
    : '過去の会話';
  const conv = await createConversation(title);

  for (const msg of orphans) {
    await db.put(STORE_NAME, { ...msg, conversationId: conv.id });
  }

  return conv.id;
}
