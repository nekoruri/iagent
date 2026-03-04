import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechInput } from './useSpeechInput';

// SpeechRecognition のモック
function createMockRecognition() {
  return {
    lang: '',
    continuous: true,
    interimResults: false,
    onresult: null as ((e: unknown) => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    onend: null as (() => void) | null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  };
}

let mockRecognition: ReturnType<typeof createMockRecognition>;

describe('useSpeechInput', () => {
  beforeEach(() => {
    mockRecognition = createMockRecognition();
    (window as Record<string, unknown>).SpeechRecognition = vi.fn(() => mockRecognition);
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).SpeechRecognition;
    delete (window as Record<string, unknown>).webkitSpeechRecognition;
  });

  it('API 対応環境では isSupported=true', () => {
    const { result } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), true));
    expect(result.current.isSupported).toBe(true);
  });

  it('API 未対応環境では isSupported=false', () => {
    delete (window as Record<string, unknown>).SpeechRecognition;
    const { result } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), true));
    expect(result.current.isSupported).toBe(false);
  });

  it('startListening で認識を開始し isListening=true', () => {
    const { result } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), true));
    act(() => result.current.startListening());
    expect(result.current.isListening).toBe(true);
    expect(mockRecognition.start).toHaveBeenCalledOnce();
  });

  it('enabled=false の場合 startListening しても何も起きない', () => {
    const { result } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), false));
    act(() => result.current.startListening());
    expect(result.current.isListening).toBe(false);
    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  it('stopListening で recognition.stop() が呼ばれる', () => {
    const { result } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), true));
    act(() => result.current.startListening());
    act(() => result.current.stopListening());
    expect(mockRecognition.stop).toHaveBeenCalledOnce();
  });

  it('認識結果（final）で onResult コールバックが呼ばれる', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput('ja-JP', onResult, true));

    act(() => result.current.startListening());

    // final result をシミュレート
    act(() => {
      mockRecognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'テスト入力' }, isFinal: true, length: 1 }],
      });
    });

    expect(onResult).toHaveBeenCalledWith('テスト入力');
  });

  it('中間結果で interimText が更新される', () => {
    const { result } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), true));

    act(() => result.current.startListening());

    act(() => {
      mockRecognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'てす' }, isFinal: false, length: 1 }],
      });
    });

    expect(result.current.interimText).toBe('てす');
  });

  it('not-allowed エラーで適切なエラーメッセージが設定される', () => {
    const { result } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), true));

    act(() => result.current.startListening());
    act(() => {
      mockRecognition.onerror?.({ error: 'not-allowed' });
    });

    expect(result.current.error).toBe('マイクの使用が許可されていません。ブラウザの設定を確認してください。');
    expect(result.current.isListening).toBe(false);
  });

  it('no-speech エラーではエラーにならない', () => {
    const { result } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), true));

    act(() => result.current.startListening());
    act(() => {
      mockRecognition.onerror?.({ error: 'no-speech' });
    });

    expect(result.current.error).toBeNull();
  });

  it('onend で isListening=false に戻る', () => {
    const { result } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), true));

    act(() => result.current.startListening());
    expect(result.current.isListening).toBe(true);

    act(() => {
      mockRecognition.onend?.();
    });

    expect(result.current.isListening).toBe(false);
  });

  it('アンマウント時に abort() が呼ばれる', () => {
    const { result, unmount } = renderHook(() => useSpeechInput('ja-JP', vi.fn(), true));

    act(() => result.current.startListening());
    unmount();

    expect(mockRecognition.abort).toHaveBeenCalledOnce();
  });
});
