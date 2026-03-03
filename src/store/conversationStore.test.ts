import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import { loadMessages, saveMessage, clearMessages, migrateOrphanMessages } from './conversationStore';
import { getConversation } from './conversationMetaStore';
import type { ChatMessage } from '../types';

beforeEach(() => {
  __resetStores();
});

const CONV_ID_A = 'conv-aaa';
const CONV_ID_B = 'conv-bbb';

describe('loadMessages', () => {
  it('指定 conversationId のメッセージのみ返す', async () => {
    const m1: ChatMessage = {
      id: 'msg-1', role: 'user', content: '会話A', timestamp: 1000, conversationId: CONV_ID_A,
    };
    const m2: ChatMessage = {
      id: 'msg-2', role: 'user', content: '会話B', timestamp: 2000, conversationId: CONV_ID_B,
    };
    const m3: ChatMessage = {
      id: 'msg-3', role: 'assistant', content: '会話A返信', timestamp: 3000, conversationId: CONV_ID_A,
    };

    await saveMessage(m1);
    await saveMessage(m2);
    await saveMessage(m3);

    const messagesA = await loadMessages(CONV_ID_A);
    expect(messagesA).toHaveLength(2);
    expect(messagesA[0].id).toBe('msg-1');
    expect(messagesA[1].id).toBe('msg-3');

    const messagesB = await loadMessages(CONV_ID_B);
    expect(messagesB).toHaveLength(1);
    expect(messagesB[0].id).toBe('msg-2');
  });

  it('該当メッセージがないとき空配列を返す', async () => {
    const messages = await loadMessages('non-existent');
    expect(messages).toEqual([]);
  });

  it('timestamp 昇順でソートして返す', async () => {
    await saveMessage({
      id: 'msg-a', role: 'user', content: '後', timestamp: 3000, conversationId: CONV_ID_A,
    });
    await saveMessage({
      id: 'msg-b', role: 'user', content: '先', timestamp: 1000, conversationId: CONV_ID_A,
    });

    const messages = await loadMessages(CONV_ID_A);
    expect(messages[0].id).toBe('msg-b');
    expect(messages[1].id).toBe('msg-a');
  });
});

describe('clearMessages', () => {
  it('指定 conversationId のメッセージのみ削除する', async () => {
    await saveMessage({
      id: 'msg-1', role: 'user', content: '会話A', timestamp: 1000, conversationId: CONV_ID_A,
    });
    await saveMessage({
      id: 'msg-2', role: 'user', content: '会話B', timestamp: 2000, conversationId: CONV_ID_B,
    });

    await clearMessages(CONV_ID_A);

    const messagesA = await loadMessages(CONV_ID_A);
    expect(messagesA).toEqual([]);

    const messagesB = await loadMessages(CONV_ID_B);
    expect(messagesB).toHaveLength(1);
  });
});

describe('migrateOrphanMessages', () => {
  it('conversationId 未設定のメッセージをマイグレーションする', async () => {
    // conversationId なしのメッセージを保存
    await saveMessage({
      id: 'orphan-1', role: 'user', content: 'こんにちはテストメッセージ', timestamp: 1000,
    } as ChatMessage);
    await saveMessage({
      id: 'orphan-2', role: 'assistant', content: '返信', timestamp: 2000,
    } as ChatMessage);

    const convId = await migrateOrphanMessages();
    expect(convId).not.toBeNull();

    // マイグレーション先の会話メタデータが作成されている
    const conv = await getConversation(convId!);
    expect(conv).toBeDefined();
    expect(conv!.title).toBe('こんにちはテストメッセージ');

    // メッセージに conversationId が付与されている
    const messages = await loadMessages(convId!);
    expect(messages).toHaveLength(2);
  });

  it('マイグレーション対象がなければ null を返す', async () => {
    await saveMessage({
      id: 'msg-ok', role: 'user', content: 'テスト', timestamp: 1000, conversationId: CONV_ID_A,
    });

    const result = await migrateOrphanMessages();
    expect(result).toBeNull();
  });

  it('データが空のとき null を返す', async () => {
    const result = await migrateOrphanMessages();
    expect(result).toBeNull();
  });

  it('先頭メッセージが assistant なら「過去の会話」をタイトルにする', async () => {
    await saveMessage({
      id: 'orphan-1', role: 'assistant', content: 'ヒントメッセージ', timestamp: 1000,
    } as ChatMessage);

    const convId = await migrateOrphanMessages();
    const conv = await getConversation(convId!);
    expect(conv!.title).toBe('過去の会話');
  });
});
