import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversations } from './useConversations';
import type { Conversation } from '../types';

// ストアモック
const mockConversations: Conversation[] = [
  { id: 'conv-1', title: '会話1', createdAt: 1000, updatedAt: 2000, messageCount: 3 },
  { id: 'conv-2', title: '会話2', createdAt: 1500, updatedAt: 1500, messageCount: 1 },
];

vi.mock('../store/conversationMetaStore', () => ({
  listConversations: vi.fn(async () => [...mockConversations]),
  createConversation: vi.fn(async () => ({
    id: 'conv-new',
    title: '新しい会話',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 0,
  })),
  updateConversation: vi.fn(async () => {}),
  deleteConversation: vi.fn(async () => {}),
}));

vi.mock('../store/conversationStore', () => ({
  clearMessages: vi.fn(async () => {}),
  migrateOrphanMessages: vi.fn(async () => null),
}));

const mockDeleteAttachments = vi.fn(async () => {});
vi.mock('../store/attachmentStore', () => ({
  deleteAttachmentsByConversationId: (...args: unknown[]) => mockDeleteAttachments(...args),
}));

describe('useConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初期ロードで会話一覧を取得し、最初の会話をアクティブにする', async () => {
    const { result } = renderHook(() => useConversations());

    // 非同期ロード完了を待つ
    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.activeConversationId).toBe('conv-1');
    expect(result.current.activeConversation?.title).toBe('会話1');
  });

  it('create() で新しい会話を作成し、アクティブにする', async () => {
    const { result } = renderHook(() => useConversations());

    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    await act(async () => {
      await result.current.create();
    });

    expect(result.current.activeConversationId).toBe('conv-new');
    expect(result.current.conversations[0].id).toBe('conv-new');
  });

  it('switchTo() でアクティブな会話を切り替える', async () => {
    const { result } = renderHook(() => useConversations());

    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    act(() => {
      result.current.switchTo('conv-2');
    });

    expect(result.current.activeConversationId).toBe('conv-2');
    expect(result.current.activeConversation?.title).toBe('会話2');
  });

  it('remove() で会話を削除し、別の会話をアクティブにする', async () => {
    const { result } = renderHook(() => useConversations());

    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    await act(async () => {
      await result.current.remove('conv-1');
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversationId).toBe('conv-2');
    // 添付データも削除される
    expect(mockDeleteAttachments).toHaveBeenCalledWith('conv-1');
  });

  it('rename() で会話のタイトルを変更する', async () => {
    const { result } = renderHook(() => useConversations());

    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    await act(async () => {
      await result.current.rename('conv-1', '新しいタイトル');
    });

    const conv = result.current.conversations.find((c) => c.id === 'conv-1');
    expect(conv?.title).toBe('新しいタイトル');
  });

  it('touch() で更新日時とメッセージ数を更新し、ソートが反映される', async () => {
    const { result } = renderHook(() => useConversations());

    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    await act(async () => {
      await result.current.touch('conv-2', 10);
    });

    // conv-2 が更新されて先頭に来るはず
    expect(result.current.conversations[0].id).toBe('conv-2');
    expect(result.current.conversations[0].messageCount).toBe(10);
  });
});
