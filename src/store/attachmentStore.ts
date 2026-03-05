import { getDB } from './db';
import type { Attachment } from '../types/attachment';

const STORE_NAME = 'attachments';

export interface StoredAttachmentRow extends Omit<Attachment, 'dataUri' | 'thumbnailUri'> {
  dataUri?: string;
  thumbnailUri?: string;
  dataBlob?: Blob;
  thumbnailBlob?: Blob;
}

function dataUriToBlob(dataUri: string): Blob {
  const commaIndex = dataUri.indexOf(',');
  if (commaIndex < 0) return new Blob([]);

  const header = dataUri.slice(0, commaIndex);
  const payload = dataUri.slice(commaIndex + 1);
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  if (!header.includes(';base64')) {
    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  }

  let binary: string;
  try {
    binary = atob(payload);
  } catch {
    return new Blob([payload], { type: mimeType });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Blob の data URI 変換に失敗しました'));
    };
    reader.onerror = () => reject(new Error('Blob の data URI 変換に失敗しました'));
    reader.readAsDataURL(blob);
  });
}

export function toStoredAttachmentRow(attachment: Attachment): StoredAttachmentRow {
  return {
    id: attachment.id,
    messageId: attachment.messageId,
    conversationId: attachment.conversationId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt,
    dataBlob: dataUriToBlob(attachment.dataUri),
    thumbnailBlob: attachment.thumbnailUri ? dataUriToBlob(attachment.thumbnailUri) : undefined,
  };
}

export async function normalizeStoredAttachment(
  row: StoredAttachmentRow,
): Promise<Attachment | null> {
  if (
    !row ||
    typeof row.id !== 'string' ||
    typeof row.messageId !== 'string' ||
    typeof row.conversationId !== 'string' ||
    typeof row.filename !== 'string' ||
    typeof row.mimeType !== 'string' ||
    typeof row.size !== 'number' ||
    typeof row.createdAt !== 'number'
  ) {
    return null;
  }

  const dataUri = row.dataUri ?? (row.dataBlob ? await blobToDataUri(row.dataBlob) : undefined);
  if (!dataUri) return null;
  const thumbnailUri = row.thumbnailUri ?? (row.thumbnailBlob ? await blobToDataUri(row.thumbnailBlob) : undefined);

  return {
    id: row.id,
    messageId: row.messageId,
    conversationId: row.conversationId,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    dataUri,
    thumbnailUri,
    createdAt: row.createdAt,
  };
}

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

  await db.put(STORE_NAME, toStoredAttachmentRow(attachment));
  return attachment;
}

/** メッセージ ID で添付を取得 */
export async function getAttachmentsByMessageId(messageId: string): Promise<Attachment[]> {
  const grouped = await getAttachmentsByMessageIds([messageId]);
  return grouped[messageId] ?? [];
}

/** メッセージ ID 群に紐づく添付を一括取得 */
export async function getAttachmentsByMessageIds(
  messageIds: string[],
): Promise<Record<string, Attachment[]>> {
  const uniqueMessageIds = [...new Set(messageIds)];
  const grouped: Record<string, Attachment[]> = {};
  for (const id of uniqueMessageIds) {
    grouped[id] = [];
  }
  if (uniqueMessageIds.length === 0) return grouped;

  const db = await getDB();
  const rows = (await db.getAll(STORE_NAME)) as StoredAttachmentRow[];
  const all = (await Promise.all(rows.map((row) => normalizeStoredAttachment(row))))
    .filter((row): row is Attachment => row !== null);
  for (const attachment of all) {
    if (grouped[attachment.messageId]) {
      grouped[attachment.messageId].push(attachment);
    }
  }

  return grouped;
}

/** 会話 ID に紐づく添付を全削除 */
export async function deleteAttachmentsByConversationId(conversationId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const items = await tx.store.index('conversationId').getAll(conversationId);
  for (const item of items) {
    await tx.store.delete((item as StoredAttachmentRow).id);
  }
  await tx.done;
}
