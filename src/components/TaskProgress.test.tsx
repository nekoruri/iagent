import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskProgress } from './TaskProgress';
import type { ToolCallInfo } from '../types';

function makeTools(): ToolCallInfo[] {
  return [
    {
      id: 'tool-search',
      name: '検索',
      status: 'completed',
      result: JSON.stringify({ summary: '検索結果を2件取得しました' }),
    },
    {
      id: 'tool-save',
      name: '保存',
      status: 'running',
    },
  ];
}

describe('TaskProgress', () => {
  it('ツールが1件以下なら表示しない', () => {
    const { container } = render(<TaskProgress tools={[makeTools()[0]]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('summary を持つ行は開閉ボタンとして表示される', () => {
    render(<TaskProgress tools={makeTools()} />);

    expect(screen.getByRole('button', { name: /検索/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /保存/ })).toBeNull();
    expect(screen.getByText('詳細を開く')).toBeInTheDocument();
  });

  it('クリックで summary を開閉できる', async () => {
    const user = userEvent.setup();
    render(<TaskProgress tools={makeTools()} />);

    const toggle = screen.getByRole('button', { name: /検索/ });
    expect(screen.queryByText('検索結果を2件取得しました')).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('検索結果を2件取得しました')).toBeInTheDocument();
    expect(screen.getByText('詳細を閉じる')).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('検索結果を2件取得しました')).toBeNull();
  });

  it('キーボード操作でも summary を開閉できる', async () => {
    const user = userEvent.setup();
    render(<TaskProgress tools={makeTools()} />);

    const toggle = screen.getByRole('button', { name: /検索/ });
    toggle.focus();

    await user.keyboard('[Space]');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('検索結果を2件取得しました')).toBeInTheDocument();

    await user.keyboard('[Enter]');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('検索結果を2件取得しました')).toBeNull();
  });
});
