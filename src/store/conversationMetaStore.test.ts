import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
} from './conversationMetaStore';

beforeEach(() => {
  __resetStores();
});

describe('createConversation', () => {
  it('デフォルトタイトルで会話を作成する', async () => {
    const conv = await createConversation();
    expect(conv.id).toBeDefined();
    expect(conv.title).toBe('新しい会話');
    expect(conv.messageCount).toBe(0);
    expect(conv.createdAt).toBeGreaterThan(0);
    expect(conv.updatedAt).toBe(conv.createdAt);
  });

  it('指定タイトルで会話を作成する', async () => {
    const conv = await createConversation('テスト会話');
    expect(conv.title).toBe('テスト会話');
  });
});

describe('listConversations', () => {
  it('空のとき空配列を返す', async () => {
    const list = await listConversations();
    expect(list).toEqual([]);
  });

  it('updatedAt 降順でソートして返す', async () => {
    const c1 = await createConversation('古い会話');
    await updateConversation(c1.id, { updatedAt: 1000 });

    const c2 = await createConversation('新しい会話');
    await updateConversation(c2.id, { updatedAt: 3000 });

    const c3 = await createConversation('中間の会話');
    await updateConversation(c3.id, { updatedAt: 2000 });

    const list = await listConversations();
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe(c2.id);
    expect(list[1].id).toBe(c3.id);
    expect(list[2].id).toBe(c1.id);
  });
});

describe('getConversation', () => {
  it('存在する会話を取得する', async () => {
    const created = await createConversation('取得テスト');
    const fetched = await getConversation(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.title).toBe('取得テスト');
  });

  it('存在しないIDで undefined を返す', async () => {
    const result = await getConversation('non-existent-id');
    expect(result).toBeUndefined();
  });
});

describe('updateConversation', () => {
  it('タイトルを更新する', async () => {
    const conv = await createConversation('変更前');
    await updateConversation(conv.id, { title: '変更後' });

    const updated = await getConversation(conv.id);
    expect(updated!.title).toBe('変更後');
  });

  it('messageCount を更新する', async () => {
    const conv = await createConversation();
    await updateConversation(conv.id, { messageCount: 5, updatedAt: Date.now() });

    const updated = await getConversation(conv.id);
    expect(updated!.messageCount).toBe(5);
  });

  it('存在しないIDでエラーにならない', async () => {
    await expect(
      updateConversation('non-existent', { title: 'test' }),
    ).resolves.toBeUndefined();
  });
});

describe('deleteConversation', () => {
  it('会話を削除する', async () => {
    const conv = await createConversation('削除テスト');
    await deleteConversation(conv.id);

    const result = await getConversation(conv.id);
    expect(result).toBeUndefined();
  });
});
