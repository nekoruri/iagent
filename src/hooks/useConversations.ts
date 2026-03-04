import { useState, useEffect, useCallback } from 'react';
import {
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
} from '../store/conversationMetaStore';
import { deleteAttachmentsByConversationId } from '../store/attachmentStore';
import { clearMessages, migrateOrphanMessages } from '../store/conversationStore';
import type { Conversation } from '../types';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 初回ロード: マイグレーション → 会話一覧取得
  useEffect(() => {
    (async () => {
      const migratedId = await migrateOrphanMessages();
      const list = await listConversations();
      setConversations(list);

      if (migratedId) {
        setActiveConversationId(migratedId);
      } else if (list.length > 0) {
        setActiveConversationId(list[0].id);
      }
      setLoaded(true);
    })();
  }, []);

  const create = useCallback(async () => {
    const conv = await createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(conv.id);
    return conv;
  }, []);

  const switchTo = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await clearMessages(id);
    await deleteAttachmentsByConversationId(id);
    await deleteConversation(id);
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      // 削除した会話がアクティブなら別の会話にフォーカス
      setActiveConversationId((currentId) => {
        if (currentId === id) {
          return updated.length > 0 ? updated[0].id : null;
        }
        return currentId;
      });
      return updated;
    });
  }, []);

  const touch = useCallback(async (id: string, messageCount: number) => {
    const now = Date.now();
    await updateConversation(id, { updatedAt: now, messageCount });
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === id ? { ...c, updatedAt: now, messageCount } : c,
      );
      return updated.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    await updateConversation(id, { title });
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  return {
    conversations,
    activeConversationId,
    activeConversation,
    loaded,
    create,
    switchTo,
    remove,
    rename,
    touch,
  };
}
