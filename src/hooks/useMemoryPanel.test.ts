import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { useMemoryPanel } from './useMemoryPanel';
import { saveMemory, cleanupLowScoredMemories } from '../store/memoryStore';

beforeEach(() => {
  __resetStores();
});

describe('useMemoryPanel', () => {
  it('toggle でパネルの開閉を切り替えできる', async () => {
    const { result } = renderHook(() => useMemoryPanel());

    expect(result.current.isOpen).toBe(false);

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('changeCategory でカテゴリを切り替えできる', async () => {
    await saveMemory('事実メモリ', 'fact');
    await saveMemory('好みメモリ', 'preference');

    const { result } = renderHook(() => useMemoryPanel());

    await act(async () => {
      result.current.changeCategory('fact');
    });

    expect(result.current.selectedCategory).toBe('fact');
    expect(result.current.memories.every((m) => m.category === 'fact')).toBe(true);
  });

  it('handleDelete でメモリを削除できる', async () => {
    const mem = await saveMemory('削除テスト', 'other');

    const { result } = renderHook(() => useMemoryPanel());

    // refresh で初期データを読み込み
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.memories).toHaveLength(1);

    await act(async () => {
      await result.current.handleDelete(mem.id);
    });
    expect(result.current.memories).toHaveLength(0);
  });

  it('close でパネルを閉じる', async () => {
    const { result } = renderHook(() => useMemoryPanel());

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    await act(async () => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('changeViewTab でアーカイブビューに切り替えできる', async () => {
    for (let i = 0; i < 5; i++) {
      await saveMemory(`メモリ ${i}`, 'other');
    }
    await cleanupLowScoredMemories(2);

    const { result } = renderHook(() => useMemoryPanel());

    expect(result.current.viewTab).toBe('active');

    await act(async () => {
      result.current.changeViewTab('archive');
    });

    expect(result.current.viewTab).toBe('archive');
    expect(result.current.selectedCategory).toBeUndefined();
    expect(result.current.archivedMemories.length).toBeGreaterThanOrEqual(1);
  });

  it('changeViewTab で active に戻すとカテゴリがリセットされる', async () => {
    await saveMemory('テスト', 'fact');

    const { result } = renderHook(() => useMemoryPanel());

    await act(async () => {
      result.current.changeViewTab('archive');
    });
    expect(result.current.viewTab).toBe('archive');

    await act(async () => {
      result.current.changeViewTab('active');
    });
    expect(result.current.viewTab).toBe('active');
    expect(result.current.selectedCategory).toBeUndefined();
  });

  it('handleRestore でアーカイブを復元できる', async () => {
    for (let i = 0; i < 5; i++) {
      await saveMemory(`メモリ ${i}`, 'other');
    }
    await cleanupLowScoredMemories(2);

    const { result } = renderHook(() => useMemoryPanel());

    await act(async () => {
      result.current.changeViewTab('archive');
    });

    const archiveCount = result.current.archivedMemories.length;
    expect(archiveCount).toBeGreaterThanOrEqual(1);

    const targetId = result.current.archivedMemories[0].id;
    await act(async () => {
      await result.current.handleRestore(targetId);
    });

    expect(result.current.archivedMemories).toHaveLength(archiveCount - 1);
  });

  it('handleDeleteArchived でアーカイブを完全削除できる', async () => {
    for (let i = 0; i < 5; i++) {
      await saveMemory(`メモリ ${i}`, 'other');
    }
    await cleanupLowScoredMemories(2);

    const { result } = renderHook(() => useMemoryPanel());

    await act(async () => {
      result.current.changeViewTab('archive');
    });

    const archiveCount = result.current.archivedMemories.length;
    expect(archiveCount).toBeGreaterThanOrEqual(1);

    const targetId = result.current.archivedMemories[0].id;
    await act(async () => {
      await result.current.handleDeleteArchived(targetId);
    });

    expect(result.current.archivedMemories).toHaveLength(archiveCount - 1);
  });
});
