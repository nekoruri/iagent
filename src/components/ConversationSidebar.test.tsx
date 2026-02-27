import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationSidebar } from './ConversationSidebar';
import type { Conversation } from '../types';

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'conv-1',
  title: 'テスト会話',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messageCount: 5,
  ...overrides,
});

describe('ConversationSidebar', () => {
  const defaultProps = {
    conversations: [] as Conversation[],
    activeId: null as string | null,
    open: true,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };

  it('会話一覧が表示される', () => {
    const conversations = [
      makeConversation({ id: 'conv-1', title: '最初の会話' }),
      makeConversation({ id: 'conv-2', title: '二番目の会話' }),
    ];
    render(<ConversationSidebar {...defaultProps} conversations={conversations} />);

    expect(screen.getByText('最初の会話')).toBeInTheDocument();
    expect(screen.getByText('二番目の会話')).toBeInTheDocument();
  });

  it('会話が空の場合は「会話がありません」と表示される', () => {
    render(<ConversationSidebar {...defaultProps} conversations={[]} />);

    expect(screen.getByText('会話がありません')).toBeInTheDocument();
  });

  it('会話をクリックすると onSelect が呼ばれる', async () => {
    const onSelect = vi.fn();
    const conversations = [makeConversation({ id: 'conv-1', title: 'テスト' })];
    render(
      <ConversationSidebar {...defaultProps} conversations={conversations} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByText('テスト'));
    expect(onSelect).toHaveBeenCalledWith('conv-1');
  });

  it('削除ボタンをクリックすると onDelete が呼ばれる（onSelect は呼ばれない）', async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const conversations = [makeConversation({ id: 'conv-1', title: 'テスト' })];
    render(
      <ConversationSidebar
        {...defaultProps}
        conversations={conversations}
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /テスト.*削除/ }));
    expect(onDelete).toHaveBeenCalledWith('conv-1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('「+ 新しい会話」ボタンで onCreate が呼ばれる', async () => {
    const onCreate = vi.fn();
    render(<ConversationSidebar {...defaultProps} onCreate={onCreate} />);

    await userEvent.click(screen.getByText('+ 新しい会話'));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('閉じるボタンで onClose が呼ばれる', async () => {
    const onClose = vi.fn();
    render(<ConversationSidebar {...defaultProps} onClose={onClose} />);

    await userEvent.click(screen.getByTitle('閉じる'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('アクティブな会話にアクティブクラスと aria-current が適用される', () => {
    const conversations = [
      makeConversation({ id: 'conv-1', title: '会話1' }),
      makeConversation({ id: 'conv-2', title: '会話2' }),
    ];
    const { container } = render(
      <ConversationSidebar {...defaultProps} conversations={conversations} activeId="conv-1" />,
    );

    const activeItems = container.querySelectorAll('.sidebar-item-active');
    expect(activeItems).toHaveLength(1);
    expect(activeItems[0]).toHaveTextContent('会話1');

    // aria-current="true" がアクティブな選択ボタンに設定される
    const conv1Button = screen.getByText('会話1').closest('button');
    expect(conv1Button).toHaveAttribute('aria-current', 'true');

    // 非アクティブな会話には aria-current がない
    const conv2Button = screen.getByText('会話2').closest('button');
    expect(conv2Button).not.toHaveAttribute('aria-current');
  });

  it('open=false ではサイドバーに sidebar-open クラスが付かない', () => {
    const { container } = render(<ConversationSidebar {...defaultProps} open={false} />);

    const aside = container.querySelector('aside');
    expect(aside?.classList.contains('sidebar-open')).toBe(false);
  });

  it('キーボード Tab → Enter で会話を選択できる', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const conversations = [
      makeConversation({ id: 'conv-1', title: '会話A' }),
      makeConversation({ id: 'conv-2', title: '会話B' }),
    ];
    render(
      <ConversationSidebar {...defaultProps} conversations={conversations} onSelect={onSelect} />,
    );

    // Tab で選択ボタンにフォーカスし Enter で選択
    const selectButton = screen.getByText('会話A').closest('button')!;
    selectButton.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('conv-1');
  });

  it('削除ボタンの aria-label に会話名が含まれる', () => {
    const conversations = [
      makeConversation({ id: 'conv-1', title: '重要な会話' }),
      makeConversation({ id: 'conv-2', title: '別の会話' }),
    ];
    render(<ConversationSidebar {...defaultProps} conversations={conversations} />);

    expect(screen.getByLabelText('「重要な会話」を削除')).toBeInTheDocument();
    expect(screen.getByLabelText('「別の会話」を削除')).toBeInTheDocument();
  });
});
