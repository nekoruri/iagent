import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';

describe('MessageBubble', () => {
  it('assistant message に explanation card を表示する', () => {
    render(<MessageBubble
      message={{
        id: 'm1',
        role: 'assistant',
        content: '[Heartbeat] 予定が近いです',
        timestamp: 1,
        source: 'heartbeat',
        explanationTitle: 'この通知を今出した理由',
        explanationWhyNow: 'Push 通知に確認し、朝 / 予定が近い / 通常モードとして扱いました。',
        explanationOutcome: '通知から開きました。',
      }}
    />);

    const toggle = screen.getByRole('button', { name: '理由を見る' });
    expect(toggle).toBeInTheDocument();
  });

  it('説明がない assistant message では explanation card を表示しない', () => {
    render(<MessageBubble
      message={{
        id: 'm2',
        role: 'assistant',
        content: '通常メッセージ',
        timestamp: 1,
      }}
    />);

    expect(screen.queryByText('この通知を今出した理由')).not.toBeInTheDocument();
    expect(screen.queryByText(/なぜ今:/)).not.toBeInTheDocument();
  });
});
