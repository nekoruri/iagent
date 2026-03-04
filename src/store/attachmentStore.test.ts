import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';
import {
  saveAttachment,
  getAttachmentsByMessageId,
  deleteAttachmentsByConversationId,
} from './attachmentStore';

vi.mock('./db');

beforeEach(() => {
  __resetStores();
});

describe('saveAttachment', () => {
  it('添付ファイルを保存して返す', async () => {
    const att = await saveAttachment({
      id: 'att-1',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 1024,
      dataUri: 'data:image/jpeg;base64,abc',
      thumbnailUri: 'data:image/jpeg;base64,thumb',
    });

    expect(att.id).toBe('att-1');
    expect(att.messageId).toBe('msg-1');
    expect(att.conversationId).toBe('conv-1');
    expect(att.filename).toBe('photo.jpg');
    expect(att.mimeType).toBe('image/jpeg');
    expect(att.size).toBe(1024);
    expect(att.dataUri).toBe('data:image/jpeg;base64,abc');
    expect(att.thumbnailUri).toBe('data:image/jpeg;base64,thumb');
    expect(att.createdAt).toBeGreaterThan(0);
  });

  it('thumbnailUri なしでも保存できる', async () => {
    const att = await saveAttachment({
      id: 'att-2',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      filename: 'doc.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      dataUri: 'data:application/pdf;base64,abc',
    });

    expect(att.thumbnailUri).toBeUndefined();
    expect(att.filename).toBe('doc.pdf');
  });
});

describe('getAttachmentsByMessageId', () => {
  it('指定メッセージの添付のみ返す', async () => {
    await saveAttachment({
      id: 'att-1',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      dataUri: 'data:image/jpeg;base64,a',
    });
    await saveAttachment({
      id: 'att-2',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      filename: 'b.png',
      mimeType: 'image/png',
      size: 200,
      dataUri: 'data:image/png;base64,b',
    });
    await saveAttachment({
      id: 'att-3',
      messageId: 'msg-2',
      conversationId: 'conv-1',
      filename: 'c.gif',
      mimeType: 'image/gif',
      size: 300,
      dataUri: 'data:image/gif;base64,c',
    });

    const results = await getAttachmentsByMessageId('msg-1');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(['att-1', 'att-2']);
  });

  it('該当なしなら空配列を返す', async () => {
    const results = await getAttachmentsByMessageId('no-such-msg');
    expect(results).toHaveLength(0);
  });
});

describe('deleteAttachmentsByConversationId', () => {
  it('指定会話の添付を全削除する', async () => {
    await saveAttachment({
      id: 'att-1',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      dataUri: 'data:image/jpeg;base64,a',
    });
    await saveAttachment({
      id: 'att-2',
      messageId: 'msg-2',
      conversationId: 'conv-1',
      filename: 'b.jpg',
      mimeType: 'image/jpeg',
      size: 200,
      dataUri: 'data:image/jpeg;base64,b',
    });
    await saveAttachment({
      id: 'att-3',
      messageId: 'msg-3',
      conversationId: 'conv-2',
      filename: 'c.jpg',
      mimeType: 'image/jpeg',
      size: 300,
      dataUri: 'data:image/jpeg;base64,c',
    });

    await deleteAttachmentsByConversationId('conv-1');

    const conv1 = await getAttachmentsByMessageId('msg-1');
    expect(conv1).toHaveLength(0);

    const conv2 = await getAttachmentsByMessageId('msg-3');
    expect(conv2).toHaveLength(1);
    expect(conv2[0].id).toBe('att-3');
  });
});
