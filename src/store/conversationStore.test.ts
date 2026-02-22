import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import { loadMessages, saveMessage, clearMessages } from './conversationStore';
import type { ChatMessage } from '../types';

beforeEach(() => {
  __resetStores();
});

describe('loadMessages', () => {
  it('データなしのとき空配列を返す', async () => {
    const messages = await loadMessages();
    expect(messages).toEqual([]);
  });

  it('複数メッセージを timestamp 昇順でソートして返す', async () => {
    const m1: ChatMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'こんにちは',
      timestamp: 2000,
    };
    const m2: ChatMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: 'はい、こんにちは',
      timestamp: 1000,
    };
    const m3: ChatMessage = {
      id: 'msg-3',
      role: 'user',
      content: '元気ですか',
      timestamp: 3000,
    };

    await saveMessage(m1);
    await saveMessage(m2);
    await saveMessage(m3);

    const loaded = await loadMessages();
    expect(loaded).toHaveLength(3);
    expect(loaded[0].id).toBe('msg-2');
    expect(loaded[1].id).toBe('msg-1');
    expect(loaded[2].id).toBe('msg-3');
  });
});

describe('saveMessage', () => {
  it('メッセージを保存できる', async () => {
    const msg: ChatMessage = {
      id: 'msg-save',
      role: 'user',
      content: 'テスト',
      timestamp: 1000,
    };
    await saveMessage(msg);
    const loaded = await loadMessages();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe('テスト');
  });
});

describe('clearMessages', () => {
  it('全メッセージを削除する', async () => {
    await saveMessage({
      id: 'msg-del-1',
      role: 'user',
      content: '削除テスト',
      timestamp: 1000,
    });
    await saveMessage({
      id: 'msg-del-2',
      role: 'assistant',
      content: '削除テスト2',
      timestamp: 2000,
    });

    await clearMessages();

    const loaded = await loadMessages();
    expect(loaded).toEqual([]);
  });
});
