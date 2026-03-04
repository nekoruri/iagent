import { useState, useCallback, useEffect, useRef } from 'react';
import { listMemories, deleteMemory, listArchivedMemories, restoreArchivedMemory, deleteArchivedMemory } from '../store/memoryStore';
import type { Memory, MemoryCategory, ArchivedMemory } from '../types';

export type MemoryViewTab = 'active' | 'archive';

export function useMemoryPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [archivedMemories, setArchivedMemories] = useState<ArchivedMemory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | undefined>(undefined);
  const [viewTab, setViewTab] = useState<MemoryViewTab>('active');
  const [isLoading, setIsLoading] = useState(false);
  const refreshIdRef = useRef(0);

  const refresh = useCallback(async (category?: MemoryCategory) => {
    const id = ++refreshIdRef.current;
    setIsLoading(true);
    try {
      const data = await listMemories(category);
      if (id !== refreshIdRef.current) return;
      setMemories(data);
    } finally {
      if (id === refreshIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const refreshArchive = useCallback(async (category?: MemoryCategory) => {
    const id = ++refreshIdRef.current;
    setIsLoading(true);
    try {
      const data = await listArchivedMemories(category);
      if (id !== refreshIdRef.current) return;
      setArchivedMemories(data);
    } finally {
      if (id === refreshIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        if (viewTab === 'active') {
          refresh(selectedCategory);
        } else {
          refreshArchive(selectedCategory);
        }
      }
      return next;
    });
  }, [refresh, refreshArchive, selectedCategory, viewTab]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const changeCategory = useCallback((category: MemoryCategory | undefined) => {
    setSelectedCategory(category);
    if (viewTab === 'active') {
      refresh(category);
    } else {
      refreshArchive(category);
    }
  }, [refresh, refreshArchive, viewTab]);

  const changeViewTab = useCallback((tab: MemoryViewTab) => {
    setViewTab(tab);
    setSelectedCategory(undefined);
    if (tab === 'active') {
      refresh(undefined);
    } else {
      refreshArchive(undefined);
    }
  }, [refresh, refreshArchive]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteMemory(id);
    await refresh(selectedCategory);
  }, [refresh, selectedCategory]);

  const handleRestore = useCallback(async (id: string) => {
    await restoreArchivedMemory(id);
    await refreshArchive(selectedCategory);
  }, [refreshArchive, selectedCategory]);

  const handleDeleteArchived = useCallback(async (id: string) => {
    await deleteArchivedMemory(id);
    await refreshArchive(selectedCategory);
  }, [refreshArchive, selectedCategory]);

  // 初回マウント時にデータ読み込み
  useEffect(() => {
    listMemories().then((data) => {
      setMemories(data);
    });
  }, []);

  return {
    isOpen, memories, archivedMemories, selectedCategory, viewTab, isLoading,
    toggle, close, changeCategory, changeViewTab,
    handleDelete, handleRestore, handleDeleteArchived, refresh,
  };
}
