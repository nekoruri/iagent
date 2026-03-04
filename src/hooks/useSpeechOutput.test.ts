import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechOutput } from './useSpeechOutput';

// jsdom に SpeechSynthesisUtterance が存在しないためモック
if (typeof globalThis.SpeechSynthesisUtterance === 'undefined') {
  globalThis.SpeechSynthesisUtterance = class MockUtterance {
    text: string;
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: SpeechSynthesisVoice | null = null;
    onstart: ((ev: SpeechSynthesisEvent) => void) | null = null;
    onend: ((ev: SpeechSynthesisEvent) => void) | null = null;
    onerror: ((ev: SpeechSynthesisErrorEvent) => void) | null = null;
    onpause: ((ev: SpeechSynthesisEvent) => void) | null = null;
    onresume: ((ev: SpeechSynthesisEvent) => void) | null = null;
    onmark: ((ev: SpeechSynthesisEvent) => void) | null = null;
    onboundary: ((ev: SpeechSynthesisEvent) => void) | null = null;
    constructor(text: string) { this.text = text; }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return false; }
  } as unknown as typeof SpeechSynthesisUtterance;
}

describe('useSpeechOutput', () => {
  let speakMock: ReturnType<typeof vi.fn>;
  let cancelMock: ReturnType<typeof vi.fn>;
  let getVoicesMock: ReturnType<typeof vi.fn>;
  let addEventListenerMock: ReturnType<typeof vi.fn>;
  let removeEventListenerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    speakMock = vi.fn();
    cancelMock = vi.fn();
    getVoicesMock = vi.fn(() => []);
    addEventListenerMock = vi.fn();
    removeEventListenerMock = vi.fn();

    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: speakMock,
        cancel: cancelMock,
        getVoices: getVoicesMock,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      },
      configurable: true,
    });
  });

  afterEach(() => {
    // speechSynthesis をクリーンアップ（テスト間リーク防止）
    Object.defineProperty(window, 'speechSynthesis', {
      value: undefined,
      configurable: true,
    });
  });

  it('API 対応環境では isSupported=true', () => {
    const { result } = renderHook(() => useSpeechOutput('ja-JP', 1.0, true));
    expect(result.current.isSupported).toBe(true);
  });

  it('API 未対応環境では isSupported=false', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: undefined,
      configurable: true,
    });
    const { result } = renderHook(() => useSpeechOutput('ja-JP', 1.0, true));
    expect(result.current.isSupported).toBe(false);
  });

  it('speak() で speechSynthesis.speak が呼ばれる', () => {
    const { result } = renderHook(() => useSpeechOutput('ja-JP', 1.0, true));

    act(() => result.current.speak('こんにちは'));

    expect(cancelMock).toHaveBeenCalled(); // 既存をキャンセル
    expect(speakMock).toHaveBeenCalledOnce();
    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('こんにちは');
    expect(utterance.lang).toBe('ja-JP');
    expect(utterance.rate).toBe(1.0);
  });

  it('speak() で Markdown が除去される', () => {
    const { result } = renderHook(() => useSpeechOutput('ja-JP', 1.0, true));

    act(() => result.current.speak('**太字** と `コード`'));

    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('太字 と');
  });

  it('enabled=false では speak() が何もしない', () => {
    const { result } = renderHook(() => useSpeechOutput('ja-JP', 1.0, false));

    act(() => result.current.speak('テスト'));

    expect(speakMock).not.toHaveBeenCalled();
  });

  it('空テキスト（Markdown 除去後）では speak() が何もしない', () => {
    const { result } = renderHook(() => useSpeechOutput('ja-JP', 1.0, true));

    act(() => result.current.speak('```\ncode\n```'));

    expect(speakMock).not.toHaveBeenCalled();
  });

  it('stop() で speechSynthesis.cancel が呼ばれ isSpeaking=false', () => {
    const { result } = renderHook(() => useSpeechOutput('ja-JP', 1.0, true));

    act(() => result.current.stop());

    expect(cancelMock).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
  });

  it('utterance の onstart/onend で isSpeaking が切り替わる', () => {
    const { result } = renderHook(() => useSpeechOutput('ja-JP', 1.0, true));

    act(() => result.current.speak('テスト'));

    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;

    act(() => utterance.onstart?.(new Event('start') as unknown as SpeechSynthesisEvent));
    expect(result.current.isSpeaking).toBe(true);

    act(() => utterance.onend?.(new Event('end') as unknown as SpeechSynthesisEvent));
    expect(result.current.isSpeaking).toBe(false);
  });

  it('voiceschanged イベントリスナーが登録される', () => {
    renderHook(() => useSpeechOutput('ja-JP', 1.0, true));
    expect(addEventListenerMock).toHaveBeenCalledWith('voiceschanged', expect.any(Function));
  });

  it('アンマウント時に cancel が呼ばれる', () => {
    const { unmount } = renderHook(() => useSpeechOutput('ja-JP', 1.0, true));
    cancelMock.mockClear();
    unmount();
    expect(cancelMock).toHaveBeenCalled();
  });
});
