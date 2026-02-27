import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryPanel } from './MemoryPanel';
import type { Memory } from '../types';

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

describe('MemoryPanel', () => {
  const baseProps = {
    isOpen: true,
    memories: [] as Memory[],
    selectedCategory: undefined as undefined,
    isLoading: false,
    onToggle: vi.fn(),
    onClose: vi.fn(),
    onChangeCategory: vi.fn(),
    onDelete: vi.fn(),
  };

  it('ドロップダウンが isOpen=true のとき表示される', () => {
    const { container } = render(<MemoryPanel {...baseProps} isOpen={true} />);
    expect(container.querySelector('.memory-dropdown')).toBeTruthy();
  });

  it('ドロップダウンが isOpen=false のとき非表示', () => {
    const { container } = render(<MemoryPanel {...baseProps} isOpen={false} />);
    expect(container.querySelector('.memory-dropdown')).toBeNull();
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

    const deleteBtn = screen.getByTitle('削除');
    await userEvent.click(deleteBtn);

    expect(onDelete).toHaveBeenCalledWith('mem-1');
  });

  it('記憶が空のとき空状態メッセージが表示される', () => {
    render(<MemoryPanel {...baseProps} memories={[]} />);
    expect(screen.getByText('記憶がありません')).toBeDefined();
  });
});
