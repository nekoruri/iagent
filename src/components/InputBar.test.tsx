import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InputBar } from './InputBar';

describe('InputBar', () => {
  const defaultProps = {
    onSend: vi.fn(),
    disabled: false,
    isStreaming: false,
    onStop: vi.fn(),
  };

  it('テキストを入力して送信ボタンでメッセージを送信できる', async () => {
    const onSend = vi.fn();
    render(<InputBar {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('メッセージを入力...');
    await userEvent.type(textarea, 'こんにちは');

    const sendButton = screen.getByText('送信');
    await userEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledWith('こんにちは');
    expect(textarea).toHaveValue('');
  });

  it('Enter キーでメッセージを送信できる', async () => {
    const onSend = vi.fn();
    render(<InputBar {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('メッセージを入力...');
    await userEvent.type(textarea, 'テスト{Enter}');

    expect(onSend).toHaveBeenCalledWith('テスト');
  });

  it('Shift+Enter では送信されない', async () => {
    const onSend = vi.fn();
    render(<InputBar {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('メッセージを入力...');
    fireEvent.change(textarea, { target: { value: 'テスト' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('空文字ではボタンが無効化される', () => {
    render(<InputBar {...defaultProps} />);

    const sendButton = screen.getByText('送信');
    expect(sendButton).toBeDisabled();
  });

  it('空白のみの入力では送信されない', async () => {
    const onSend = vi.fn();
    render(<InputBar {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('メッセージを入力...');
    await userEvent.type(textarea, '   {Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disabled 時はテキストエリアが無効化される', () => {
    render(<InputBar {...defaultProps} disabled={true} />);

    const textarea = screen.getByPlaceholderText('メッセージを入力...');
    expect(textarea).toBeDisabled();
  });

  it('ストリーミング中は停止ボタンが表示される', () => {
    const onStop = vi.fn();
    render(<InputBar {...defaultProps} isStreaming={true} onStop={onStop} />);

    expect(screen.queryByText('送信')).toBeNull();
    const stopButton = screen.getByText('■');
    expect(stopButton).toBeInTheDocument();
  });

  it('停止ボタンをクリックすると onStop が呼ばれる', async () => {
    const onStop = vi.fn();
    render(<InputBar {...defaultProps} isStreaming={true} onStop={onStop} />);

    await userEvent.click(screen.getByText('■'));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
