import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InputBar } from './InputBar';

// fileUtils のモック（Canvas/Image は jsdom で使えないため）
vi.mock('../core/fileUtils', async (importOriginal) => {
  const original = await importOriginal<typeof import('../core/fileUtils')>();
  return {
    ...original,
    fileToDataUri: vi.fn().mockResolvedValue('data:image/jpeg;base64,mock'),
    generateThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,thumb'),
  };
});

describe('InputBar', () => {
  const defaultProps = {
    onSend: vi.fn(),
    disabled: false,
    isStreaming: false,
    onStop: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('テキストを入力して送信ボタンでメッセージを送信できる', async () => {
    const onSend = vi.fn();
    render(<InputBar {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('メッセージを入力...');
    await userEvent.type(textarea, 'こんにちは');

    const sendButton = screen.getByText('送信');
    await userEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledWith('こんにちは', undefined);
    expect(textarea).toHaveValue('');
  });

  it('Enter キーでメッセージを送信できる', async () => {
    const onSend = vi.fn();
    render(<InputBar {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('メッセージを入力...');
    await userEvent.type(textarea, 'テスト{Enter}');

    expect(onSend).toHaveBeenCalledWith('テスト', undefined);
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

  it('isOnline=false の場合、placeholder がオフラインメッセージに変わる', () => {
    render(<InputBar {...defaultProps} isOnline={false} />);

    expect(screen.getByPlaceholderText('オフラインです — ネットワーク接続を確認してください')).toBeInTheDocument();
  });

  it('isOnline=true の場合、通常の placeholder が表示される', () => {
    render(<InputBar {...defaultProps} isOnline={true} />);

    expect(screen.getByPlaceholderText('メッセージを入力...')).toBeInTheDocument();
  });

  // ファイル添付テスト
  describe('ファイル添付', () => {
    it('ファイル添付ボタンが表示される', () => {
      render(<InputBar {...defaultProps} />);
      expect(screen.getByLabelText('ファイルを添付')).toBeInTheDocument();
    });

    it('disabled 時はファイル添付ボタンも無効化される', () => {
      render(<InputBar {...defaultProps} disabled={true} />);
      expect(screen.getByLabelText('ファイルを添付')).toBeDisabled();
    });

    it('画像ファイル選択でプレビューが表示される', async () => {
      render(<InputBar {...defaultProps} />);

      const file = new File(['image-data'], 'photo.jpg', { type: 'image/jpeg' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      // プレビュー画像が表示される
      const img = await screen.findByAltText('photo.jpg');
      expect(img).toBeInTheDocument();
    });

    it('非画像ファイル選択でファイル名が表示される', async () => {
      render(<InputBar {...defaultProps} />);

      const file = new File(['pdf-data'], 'document.pdf', { type: 'application/pdf' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      expect(await screen.findByText('document.pdf')).toBeInTheDocument();
    });

    it('プレビューの削除ボタンで添付を除去できる', async () => {
      render(<InputBar {...defaultProps} />);

      const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);
      expect(await screen.findByAltText('test.jpg')).toBeInTheDocument();

      const removeBtn = screen.getByLabelText('test.jpg を削除');
      await userEvent.click(removeBtn);

      expect(screen.queryByAltText('test.jpg')).toBeNull();
    });

    it('添付のみ（テキストなし）でも送信できる', async () => {
      const onSend = vi.fn();
      render(<InputBar {...defaultProps} onSend={onSend} />);

      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);
      await screen.findByAltText('photo.jpg');

      // テキスト未入力でも送信ボタンが有効
      const sendButton = screen.getByText('送信');
      expect(sendButton).not.toBeDisabled();

      await userEvent.click(sendButton);
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend.mock.calls[0][0]).toBe('');
      expect(onSend.mock.calls[0][1]).toHaveLength(1);
      expect(onSend.mock.calls[0][1][0].file.name).toBe('photo.jpg');
    });

    it('送信後に添付がクリアされる', async () => {
      const onSend = vi.fn();
      render(<InputBar {...defaultProps} onSend={onSend} />);

      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);
      await screen.findByAltText('photo.jpg');

      await userEvent.click(screen.getByText('送信'));

      expect(screen.queryByAltText('photo.jpg')).toBeNull();
    });

    it('空ファイルはエラーメッセージが表示される', async () => {
      render(<InputBar {...defaultProps} />);

      const file = new File([], 'empty.txt', { type: 'text/plain' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      await userEvent.upload(input, file);

      expect(await screen.findByRole('alert')).toHaveTextContent('空です');
    });
  });
});
