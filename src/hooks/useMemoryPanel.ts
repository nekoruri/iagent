import { useState, useCallback, useEffect } from 'react';
import { listMemories, deleteMemory } from '../store/memoryStore';
import type { Memory, MemoryCategory } from '../types';

export function useMemoryPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async (category?: MemoryCategory) => {
    setIsLoading(true);
    try {
      const data = await listMemories(category);
      setMemories(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        refresh(selectedCategory);
      }
      return next;
    });
  }, [refresh, selectedCategory]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const changeCategory = useCallback((category: MemoryCategory | undefined) => {
    setSelectedCategory(category);
    refresh(category);
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteMemory(id);
    await refresh(selectedCategory);
  }, [refresh, selectedCategory]);

  // 初回マウント時にデータ読み込み
  useEffect(() => {
    listMemories().then((data) => {
      setMemories(data);
    });
  }, []);

  return { isOpen, memories, selectedCategory, isLoading, toggle, close, changeCategory, handleDelete, refresh };
}
