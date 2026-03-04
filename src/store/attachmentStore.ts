import { getDB } from './db';
import type { Attachment } from '../types/attachment';

const STORE_NAME = 'attachments';

/** 添付ファイルを保存 */
export async function saveAttachment(params: {
  id: string;
  messageId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  size: number;
  dataUri: string;
  thumbnailUri?: string;
}): Promise<Attachment> {
  const db = await getDB();

  const attachment: Attachment = {
    id: params.id,
    messageId: params.messageId,
    conversationId: params.conversationId,
    filename: params.filename,
    mimeType: params.mimeType,
    size: params.size,
    dataUri: params.dataUri,
    thumbnailUri: params.thumbnailUri,
    createdAt: Date.now(),
  };

  await db.put(STORE_NAME, attachment);
  return attachment;
}

/** メッセージ ID で添付を取得 */
export async function getAttachmentsByMessageId(messageId: string): Promise<Attachment[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, 'messageId', messageId) as Promise<Attachment[]>;
}

/** 会話 ID に紐づく添付を全削除 */
export async function deleteAttachmentsByConversationId(conversationId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const items = await tx.store.index('conversationId').getAll(conversationId);
  for (const item of items) {
    await tx.store.delete((item as Attachment).id);
  }
  await tx.done;
}
