import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryPanel } from './MemoryPanel';
import type { Memory, ArchivedMemory } from '../types';

function makeMemory(overrides?: Partial<Memory>): Memory {
  return {
    id: crypto.randomUUID(),
    content: 'テストメモリ',
    category: 'fact',
    importance: 3,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    accessCount: 0,
    lastAccessedAt: Date.now(),
    contentHash: '',
    ...overrides,
  };
}

function makeArchivedMemory(overrides?: Partial<ArchivedMemory>): ArchivedMemory {
  return {
    ...makeMemory(),
    archivedAt: Date.now(),
    archiveReason: 'low-score',
    ...overrides,
  };
}

describe('MemoryPanel', () => {
  const baseProps = {
    isOpen: true,
    memories: [] as Memory[],
    archivedMemories: [] as ArchivedMemory[],
    reevaluationCandidates: [] as Memory[],
    selectedCategory: undefined as undefined,
    viewTab: 'active' as const,
    isLoading: false,
    onToggle: vi.fn(),
    onClose: vi.fn(),
    onChangeCategory: vi.fn(),
    onChangeViewTab: vi.fn(),
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    onArchive: vi.fn(),
    onRestore: vi.fn(),
    onDeleteArchived: vi.fn(),
  };

  it('ドロップダウンが isOpen=true のとき表示される', () => {
    const { container } = render(<MemoryPanel {...baseProps} isOpen={true} />);
    expect(container.querySelector('.memory-dropdown')).toBeTruthy();
  });

  it('ドロップダウンが isOpen=false のとき非表示', () => {
    const { container } = render(<MemoryPanel {...baseProps} isOpen={false} />);
    expect(container.querySelector('.memory-dropdown')).toBeNull();
  });

  it('ビュータブ（記憶/アーカイブ）が表示される', () => {
    render(<MemoryPanel {...baseProps} />);
    expect(screen.getByText('記憶')).toBeDefined();
    expect(screen.getByText('アーカイブ')).toBeDefined();
  });

  it('ビュータブクリックで onChangeViewTab が呼ばれる', async () => {
    const onChangeViewTab = vi.fn();
    render(<MemoryPanel {...baseProps} onChangeViewTab={onChangeViewTab} />);

    await userEvent.click(screen.getByText('アーカイブ'));
    expect(onChangeViewTab).toHaveBeenCalledWith('archive');
  });

  it('カテゴリタブが表示されクリックで onChangeCategory が呼ばれる', async () => {
    const onChangeCategory = vi.fn();
    render(<MemoryPanel {...baseProps} onChangeCategory={onChangeCategory} />);

    const reflectionTab = screen.getByText('ふりかえり');
    await userEvent.click(reflectionTab);

    expect(onChangeCategory).toHaveBeenCalledWith('reflection');
  });

  it('メモリカードの削除ボタンクリックで onDelete が呼ばれる', async () => {
    const onDelete = vi.fn();
    const memories = [makeMemory({ id: 'mem-1', content: '削除対象メモリ' })];
    render(<MemoryPanel {...baseProps} memories={memories} onDelete={onDelete} />);

    const deleteBtn = screen.getByLabelText('メモリを削除: 削除対象メモリ');
    await userEvent.click(deleteBtn);

    expect(onDelete).toHaveBeenCalledWith('mem-1');
  });

  it('編集ボタンで内容を更新できる', async () => {
    const onUpdate = vi.fn();
    const memories = [makeMemory({ id: 'mem-edit', content: '編集前', importance: 2, tags: ['old'] })];
    render(<MemoryPanel {...baseProps} memories={memories} onUpdate={onUpdate} />);

    await userEvent.click(screen.getByLabelText('記憶を編集: 編集前'));
    await userEvent.clear(screen.getByLabelText('記憶内容を編集'));
    await userEvent.type(screen.getByLabelText('記憶内容を編集'), '編集後');
    await userEvent.selectOptions(screen.getByLabelText('重要度を編集'), '5');
    await userEvent.clear(screen.getByLabelText('タグを編集'));
    await userEvent.type(screen.getByLabelText('タグを編集'), 'new, important');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onUpdate).toHaveBeenCalledWith('mem-edit', {
      content: '編集後',
      importance: 5,
      tags: ['new', 'important'],
    });
  });

  it('無効化ボタンで onArchive が呼ばれる', async () => {
    const onArchive = vi.fn();
    const memories = [makeMemory({ id: 'mem-archive', content: '無効化対象' })];
    render(<MemoryPanel {...baseProps} memories={memories} onArchive={onArchive} />);

    await userEvent.click(screen.getByLabelText('記憶を無効化: 無効化対象'));
    expect(onArchive).toHaveBeenCalledWith('mem-archive');
  });

  it('記憶が空のとき空状態メッセージが表示される', () => {
    render(<MemoryPanel {...baseProps} memories={[]} />);
    expect(screen.getByText('記憶がありません')).toBeDefined();
  });

  it('アーカイブビューでアーカイブ空のとき空状態メッセージが表示される', () => {
    render(<MemoryPanel {...baseProps} viewTab="archive" archivedMemories={[]} />);
    expect(screen.getByText('アーカイブはありません')).toBeDefined();
  });

  it('アーカイブビューでアーカイブ理由が表示される', () => {
    const archived = [makeArchivedMemory({ id: 'arc-1', content: 'アーカイブ記憶', archiveReason: 'low-score' })];
    render(<MemoryPanel {...baseProps} viewTab="archive" archivedMemories={archived} />);
    expect(screen.getByText('低スコア')).toBeDefined();
  });

  it('アーカイブビューで復元ボタンクリックで onRestore が呼ばれる', async () => {
    const onRestore = vi.fn();
    const archived = [makeArchivedMemory({ id: 'arc-1', content: '復元対象の記憶' })];
    render(<MemoryPanel {...baseProps} viewTab="archive" archivedMemories={archived} onRestore={onRestore} />);

    const restoreBtn = screen.getByLabelText('記憶を復元: 復元対象の記憶');
    await userEvent.click(restoreBtn);

    expect(onRestore).toHaveBeenCalledWith('arc-1');
  });

  it('アーカイブビューで削除ボタンクリックで onDeleteArchived が呼ばれる', async () => {
    const onDeleteArchived = vi.fn();
    const archived = [makeArchivedMemory({ id: 'arc-2', content: '削除対象のアーカイブ' })];
    render(<MemoryPanel {...baseProps} viewTab="archive" archivedMemories={archived} onDeleteArchived={onDeleteArchived} />);

    const deleteBtn = screen.getByLabelText('アーカイブを削除: 削除対象のアーカイブ');
    await userEvent.click(deleteBtn);

    expect(onDeleteArchived).toHaveBeenCalledWith('arc-2');
  });

  it('アーカイブビューでは件数にアーカイブ件数が表示される', () => {
    const archived = [
      makeArchivedMemory({ id: 'arc-1' }),
      makeArchivedMemory({ id: 'arc-2' }),
    ];
    render(<MemoryPanel {...baseProps} viewTab="archive" archivedMemories={archived} />);
    expect(screen.getByText('2件')).toBeDefined();
  });

  it('再評価候補がある場合にバナーとバッジが表示される', () => {
    const candidate = makeMemory({ id: 'mem-candidate', content: '見直し対象' });
    render(
      <MemoryPanel
        {...baseProps}
        memories={[candidate]}
        reevaluationCandidates={[candidate]}
      />,
    );

    expect(screen.getByText('再評価候補 1 件（低重要度かつ長期間未参照）')).toBeDefined();
    expect(screen.getByText('再評価')).toBeDefined();
  });
});
