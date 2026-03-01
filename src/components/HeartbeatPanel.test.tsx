import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeartbeatPanel } from './HeartbeatPanel';
import type { HeartbeatResult } from '../types';

describe('HeartbeatPanel', () => {
  const baseProps = {
    isOpen: true,
    results: [] as HeartbeatResult[],
    unreadCount: 0,
    onToggle: vi.fn(),
    onClose: vi.fn(),
    onTogglePin: vi.fn(),
    onFeedback: vi.fn(),
  };

  it('ピン留め結果にピンアイコン（📌）が表示される', () => {
    const results: HeartbeatResult[] = [
      { taskId: 'briefing-morning', timestamp: 1000, hasChanges: true, summary: 'ブリーフィング', pinned: true },
    ];
    render(<HeartbeatPanel {...baseProps} results={results} />);

    expect(screen.getByText('📌')).toBeDefined();
  });

  it('ピンボタンクリックで onTogglePin が呼ばれる', async () => {
    const onTogglePin = vi.fn();
    const results: HeartbeatResult[] = [
      { taskId: 'task-1', timestamp: 2000, hasChanges: false, summary: 'テスト結果' },
    ];
    render(<HeartbeatPanel {...baseProps} results={results} onTogglePin={onTogglePin} />);

    const pinButton = screen.getByTitle('ピン留め');
    await userEvent.click(pinButton);

    expect(onTogglePin).toHaveBeenCalledWith('task-1', 2000);
  });

  it('ピン留め結果に heartbeat-result-pinned クラスが付与される', () => {
    const results: HeartbeatResult[] = [
      { taskId: 'task-pinned', timestamp: 3000, hasChanges: true, summary: 'ピン留め結果', pinned: true },
      { taskId: 'task-normal', timestamp: 4000, hasChanges: false, summary: '通常結果' },
    ];
    const { container } = render(<HeartbeatPanel {...baseProps} results={results} />);

    const items = container.querySelectorAll('.heartbeat-result-item');
    expect(items[0].classList.contains('heartbeat-result-pinned')).toBe(true);
    expect(items[1].classList.contains('heartbeat-result-pinned')).toBe(false);
  });

  it('フィードバック未送信の結果にフィードバックボタンが表示される', () => {
    const results: HeartbeatResult[] = [
      { taskId: 'task-1', timestamp: 1000, hasChanges: true, summary: 'テスト' },
    ];
    render(<HeartbeatPanel {...baseProps} results={results} />);

    expect(screen.getByTitle('役に立った')).toBeDefined();
    expect(screen.getByTitle('不要')).toBeDefined();
    expect(screen.getByTitle('後で')).toBeDefined();
  });

  it('Accept ボタンクリックで onFeedback が呼ばれる', async () => {
    const onFeedback = vi.fn();
    const results: HeartbeatResult[] = [
      { taskId: 'task-1', timestamp: 1000, hasChanges: true, summary: 'テスト' },
    ];
    render(<HeartbeatPanel {...baseProps} results={results} onFeedback={onFeedback} />);

    await userEvent.click(screen.getByTitle('役に立った'));
    expect(onFeedback).toHaveBeenCalledWith('task-1', 1000, 'accepted');
  });

  it('Dismiss ボタンクリックで onFeedback が呼ばれる', async () => {
    const onFeedback = vi.fn();
    const results: HeartbeatResult[] = [
      { taskId: 'task-1', timestamp: 1000, hasChanges: true, summary: 'テスト' },
    ];
    render(<HeartbeatPanel {...baseProps} results={results} onFeedback={onFeedback} />);

    await userEvent.click(screen.getByTitle('不要'));
    expect(onFeedback).toHaveBeenCalledWith('task-1', 1000, 'dismissed');
  });

  it('accepted 済みの結果に確認済みラベルが表示される', () => {
    const results: HeartbeatResult[] = [
      { taskId: 'task-1', timestamp: 1000, hasChanges: true, summary: 'テスト', feedback: { type: 'accepted', timestamp: 2000 } },
    ];
    const { container } = render(<HeartbeatPanel {...baseProps} results={results} />);

    expect(container.querySelector('.feedback-label-accepted')).toBeDefined();
    // フィードバックボタンは非表示
    expect(screen.queryByTitle('役に立った')).toBeNull();
  });

  it('Snooze メニューが開閉できる', async () => {
    const results: HeartbeatResult[] = [
      { taskId: 'task-1', timestamp: 1000, hasChanges: true, summary: 'テスト' },
    ];
    render(<HeartbeatPanel {...baseProps} results={results} />);

    // メニューを開く
    await userEvent.click(screen.getByTitle('後で'));
    expect(screen.getByText('1時間後')).toBeDefined();
    expect(screen.getByText('明日')).toBeDefined();
    expect(screen.getByText('来週')).toBeDefined();
  });
});
