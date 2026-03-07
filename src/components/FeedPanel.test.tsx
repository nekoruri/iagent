import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedPanel } from './FeedPanel';
import type { FeedItem, Feed, FeedItemDisplayTier } from '../types';

function makeFeedItem(overrides?: Partial<FeedItem>): FeedItem {
  return {
    id: crypto.randomUUID(),
    feedId: 'feed-1',
    guid: crypto.randomUUID(),
    title: 'テスト記事',
    link: 'https://example.com/article',
    content: '',
    publishedAt: Date.now(),
    isRead: false,
    createdAt: Date.now(),
    tier: 'must-read',
    ...overrides,
  };
}

function makeFeed(overrides?: Partial<Feed>): Feed {
  return {
    id: 'feed-1',
    url: 'https://example.com/rss',
    title: 'テストフィード',
    lastFetchedAt: Date.now(),
    itemCount: 1,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('FeedPanel', () => {
  const feedMap = new Map<string, Feed>();
  feedMap.set('feed-1', makeFeed());

  const baseProps = {
    isOpen: true,
    items: [] as FeedItem[],
    feedMap,
    selectedTier: undefined as FeedItemDisplayTier | undefined,
    isLoading: false,
    unreadCount: 0,
    explanation: null,
    onToggle: vi.fn(),
    onClose: vi.fn(),
    onChangeTier: vi.fn(),
    onMarkRead: vi.fn(),
  };

  it('ドロップダウンが isOpen=true のとき表示される', () => {
    const { container } = render(<FeedPanel {...baseProps} isOpen={true} />);
    expect(container.querySelector('.feed-dropdown')).toBeTruthy();
  });

  it('ドロップダウンが isOpen=false のとき非表示', () => {
    const { container } = render(<FeedPanel {...baseProps} isOpen={false} />);
    expect(container.querySelector('.feed-dropdown')).toBeNull();
  });

  it('tier タブが表示されクリックで onChangeTier が呼ばれる', async () => {
    const onChangeTier = vi.fn();
    render(<FeedPanel {...baseProps} onChangeTier={onChangeTier} />);

    const mustReadTab = screen.getByText('必読');
    await userEvent.click(mustReadTab);

    expect(onChangeTier).toHaveBeenCalledWith('must-read');
  });

  it('記事タイトルクリックで onMarkRead が呼ばれる', async () => {
    const onMarkRead = vi.fn();
    const items = [makeFeedItem({ id: 'item-1', title: 'クリック対象記事' })];
    render(<FeedPanel {...baseProps} items={items} unreadCount={1} onMarkRead={onMarkRead} />);

    const link = screen.getByText('クリック対象記事');
    await userEvent.click(link);

    expect(onMarkRead).toHaveBeenCalledWith('item-1');
  });

  it('未読記事が空のとき空状態メッセージが表示される', () => {
    render(<FeedPanel {...baseProps} items={[]} />);
    expect(screen.getByText('未読記事がありません')).toBeDefined();
  });

  it('未読バッジが unreadCount > 0 のとき表示される', () => {
    const { container } = render(<FeedPanel {...baseProps} isOpen={false} unreadCount={5} />);
    const badge = container.querySelector('.feed-badge');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe('5');
  });

  it('未読バッジが unreadCount === 0 のとき非表示', () => {
    const { container } = render(<FeedPanel {...baseProps} isOpen={false} unreadCount={0} />);
    expect(container.querySelector('.feed-badge')).toBeNull();
  });

  it('フィード名が feedMap から表示される', () => {
    const items = [makeFeedItem({ feedId: 'feed-1', title: 'フィード名テスト' })];
    render(<FeedPanel {...baseProps} items={items} unreadCount={1} />);
    expect(screen.getByText('テストフィード')).toBeDefined();
  });

  it('tier バッジが記事に表示される', () => {
    const items = [
      makeFeedItem({ tier: 'must-read', title: '必読記事' }),
      makeFeedItem({ tier: 'recommended', title: 'おすすめ記事' }),
    ];
    const { container } = render(<FeedPanel {...baseProps} items={items} unreadCount={2} />);
    const badges = container.querySelectorAll('.feed-tier-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0].textContent).toBe('必読');
    expect(badges[1].textContent).toBe('おすすめ');
  });

  it('読み込み中の表示', () => {
    render(<FeedPanel {...baseProps} isLoading={true} />);
    expect(screen.getByText('読み込み中...')).toBeDefined();
  });

  it('panel-level explanation を表示する', () => {
    render(<FeedPanel
      {...baseProps}
      explanation={{
        title: 'フィードの新着を確認した結果',
        whyNow: 'Push 通知に確認し、朝 / 予定が近い / 通常モードとして扱いました。',
        outcome: '通知から開きました。',
      }}
    />);

    expect(screen.getByRole('button', { name: '理由を見る' })).toBeInTheDocument();
  });
});
