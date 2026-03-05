import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { useMemoryPanel } from './useMemoryPanel';
import {
  saveMemory,
  cleanupLowScoredMemories,
  listMemories,
  listArchivedMemories,
} from '../store/memoryStore';
import * as memoryStore from '../store/memoryStore';

beforeEach(() => {
  __resetStores();
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it('handleUpdate でメモリを更新できる', async () => {
    const mem = await saveMemory('更新前', 'fact', { importance: 2, tags: ['old'] });
    const { result } = renderHook(() => useMemoryPanel());

    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      await result.current.handleUpdate(mem.id, {
        content: '更新後',
        importance: 5,
        tags: ['new'],
      });
    });

    const after = await listMemories();
    expect(after[0].content).toBe('更新後');
    expect(after[0].importance).toBe(5);
    expect(after[0].tags).toEqual(['new']);
  });

  it('handleArchive でメモリを無効化（アーカイブ）できる', async () => {
    const mem = await saveMemory('無効化対象', 'other');
    const { result } = renderHook(() => useMemoryPanel());

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.memories.find((m) => m.id === mem.id)).toBeDefined();

    await act(async () => {
      await result.current.handleArchive(mem.id);
    });

    const active = await listMemories();
    const archived = await listArchivedMemories();
    expect(active.find((m) => m.id === mem.id)).toBeUndefined();
    expect(archived.find((m) => m.id === mem.id)).toBeDefined();
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

  it('refresh の連続呼び出しで先に開始した応答が後から解決しても state を上書きしない', async () => {
    const staleMemory = await saveMemory('古いデータ', 'other');
    await saveMemory('メモリ2', 'fact');

    const { result } = renderHook(() => useMemoryPanel());

    // 初回 refresh 完了を待つ
    await act(async () => {
      await result.current.refresh();
    });

    // listMemories をスパイして遅延制御
    type ListResult = Awaited<ReturnType<typeof memoryStore.listMemories>>;
    let resolveSlow!: (v: ListResult) => void;
    const slowCall = new Promise<ListResult>((r) => { resolveSlow = r; });
    vi.spyOn(memoryStore, 'listMemories').mockImplementationOnce(() => slowCall);

    // 1回目の refresh（遅延される）
    let p1: Promise<void>;
    act(() => {
      p1 = result.current.refresh();
    });

    // 2回目の refresh（即座に解決 → 最新データ）
    await act(async () => {
      await result.current.refresh('fact');
    });
    const afterSecond = result.current.memories;

    // 1回目が遅延して解決 → 古いデータで上書きされないこと
    await act(async () => {
      resolveSlow([{ ...staleMemory, content: '古い遅延応答' }]);
      await p1!;
    });

    // 2回目の結果が維持されていること
    expect(result.current.memories).toEqual(afterSecond);
    expect(result.current.isLoading).toBe(false);
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

  it('refresh 時に再評価候補が読み込まれる', async () => {
    const stale = await saveMemory('長期未参照', 'fact', { importance: 1 });
    await saveMemory('通常メモリ', 'fact', { importance: 4 });

    const { getDB } = await import('../store/__mocks__/db');
    const db = await getDB();
    const stored = await db.get('memories', stale.id) as Record<string, unknown>;
    stored.lastAccessedAt = Date.now() - (20 * 24 * 60 * 60 * 1000);
    await db.put('memories', stored);

    const { result } = renderHook(() => useMemoryPanel());
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.reevaluationCandidates.some((m) => m.id === stale.id)).toBe(true);
    expect(result.current.reevaluationCandidates.every((m) => m.importance <= 2)).toBe(true);
  });
});
