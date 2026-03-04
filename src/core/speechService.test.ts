import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  createSpeechRecognition,
  createUtterance,
  cancelSpeech,
  getAvailableVoices,
  stripMarkdown,
} from './speechService';

describe('speechService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // グローバルのクリーンアップ
    delete (window as Record<string, unknown>).SpeechRecognition;
    delete (window as Record<string, unknown>).webkitSpeechRecognition;
  });

  describe('isSpeechRecognitionSupported', () => {
    it('SpeechRecognition が存在する場合は true', () => {
      (window as Record<string, unknown>).SpeechRecognition = vi.fn();
      expect(isSpeechRecognitionSupported()).toBe(true);
    });

    it('webkitSpeechRecognition が存在する場合は true', () => {
      (window as Record<string, unknown>).webkitSpeechRecognition = vi.fn();
      expect(isSpeechRecognitionSupported()).toBe(true);
    });

    it('どちらも存在しない場合は false', () => {
      expect(isSpeechRecognitionSupported()).toBe(false);
    });
  });

  describe('isSpeechSynthesisSupported', () => {
    it('speechSynthesis が存在する場合は true', () => {
      Object.defineProperty(window, 'speechSynthesis', {
        value: { speak: vi.fn(), cancel: vi.fn(), getVoices: vi.fn(() => []) },
        configurable: true,
      });
      expect(isSpeechSynthesisSupported()).toBe(true);
    });

    it('speechSynthesis が存在しない場合は false', () => {
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        configurable: true,
      });
      expect(isSpeechSynthesisSupported()).toBe(false);
    });
  });

  describe('createSpeechRecognition', () => {
    it('SpeechRecognition インスタンスを生成し lang/continuous/interimResults を設定', () => {
      const mockInstance = {
        lang: '',
        continuous: true,
        interimResults: false,
      };
      const MockCtor = vi.fn(() => mockInstance);
      (window as Record<string, unknown>).SpeechRecognition = MockCtor;

      const result = createSpeechRecognition('ja-JP');
      expect(result.lang).toBe('ja-JP');
      expect(result.continuous).toBe(false);
      expect(result.interimResults).toBe(true);
    });

    it('API が存在しない場合はエラーをスロー', () => {
      expect(() => createSpeechRecognition('ja-JP')).toThrow('SpeechRecognition API は利用できません');
    });
  });

  describe('createUtterance', () => {
    it('SpeechSynthesisUtterance を生成し lang/rate を設定', () => {
      // jsdom に SpeechSynthesisUtterance がない場合はモック
      if (typeof globalThis.SpeechSynthesisUtterance === 'undefined') {
        class MockUtterance {
          text: string;
          lang = '';
          rate = 1;
          constructor(text: string) { this.text = text; }
        }
        globalThis.SpeechSynthesisUtterance = MockUtterance as unknown as typeof SpeechSynthesisUtterance;
      }
      const utterance = createUtterance('こんにちは', { lang: 'ja-JP', rate: 1.5 });
      expect(utterance.lang).toBe('ja-JP');
      expect(utterance.rate).toBe(1.5);
      expect(utterance.text).toBe('こんにちは');
    });
  });

  describe('cancelSpeech', () => {
    it('speechSynthesis.cancel() を呼ぶ', () => {
      const cancelMock = vi.fn();
      Object.defineProperty(window, 'speechSynthesis', {
        value: { cancel: cancelMock, speak: vi.fn(), getVoices: vi.fn(() => []) },
        configurable: true,
      });
      cancelSpeech();
      expect(cancelMock).toHaveBeenCalledOnce();
    });

    it('speechSynthesis が存在しない場合はエラーにならない', () => {
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        configurable: true,
      });
      expect(() => cancelSpeech()).not.toThrow();
    });
  });

  describe('getAvailableVoices', () => {
    it('lang フィルタなしで全音声を返す', () => {
      const voices = [
        { lang: 'ja-JP', name: 'Voice1' },
        { lang: 'en-US', name: 'Voice2' },
      ] as SpeechSynthesisVoice[];
      Object.defineProperty(window, 'speechSynthesis', {
        value: { getVoices: vi.fn(() => voices), cancel: vi.fn(), speak: vi.fn() },
        configurable: true,
      });
      expect(getAvailableVoices()).toEqual(voices);
    });

    it('lang フィルタで指定言語の音声のみ返す', () => {
      const voices = [
        { lang: 'ja-JP', name: 'Voice1' },
        { lang: 'en-US', name: 'Voice2' },
        { lang: 'ja', name: 'Voice3' },
      ] as SpeechSynthesisVoice[];
      Object.defineProperty(window, 'speechSynthesis', {
        value: { getVoices: vi.fn(() => voices), cancel: vi.fn(), speak: vi.fn() },
        configurable: true,
      });
      const result = getAvailableVoices('ja-JP');
      expect(result).toHaveLength(2);
      expect(result.map((v) => v.name)).toEqual(['Voice1', 'Voice3']);
    });

    it('speechSynthesis が未対応の場合は空配列', () => {
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        configurable: true,
      });
      expect(getAvailableVoices()).toEqual([]);
    });
  });

  describe('stripMarkdown', () => {
    it('コードブロックを除去', () => {
      expect(stripMarkdown('テスト\n```js\nconsole.log("hello")\n```\n完了')).toBe('テスト\n\n完了');
    });

    it('インラインコードを除去', () => {
      expect(stripMarkdown('変数 `foo` を使います')).toBe('変数  を使います');
    });

    it('リンクのテキストのみ残す', () => {
      expect(stripMarkdown('[Google](https://google.com) を検索')).toBe('Google を検索');
    });

    it('画像を除去', () => {
      expect(stripMarkdown('画像: ![alt](url.png) です')).toBe('画像:  です');
    });

    it('見出し記号を除去', () => {
      expect(stripMarkdown('## タイトル')).toBe('タイトル');
    });

    it('太字・斜体を除去', () => {
      expect(stripMarkdown('**太字** と *斜体*')).toBe('太字 と 斜体');
    });

    it('リスト記号を除去', () => {
      expect(stripMarkdown('- 項目1\n- 項目2')).toBe('項目1\n項目2');
    });

    it('引用記号を除去', () => {
      expect(stripMarkdown('> 引用テキスト')).toBe('引用テキスト');
    });

    it('プレーンテキストはそのまま', () => {
      expect(stripMarkdown('こんにちは、元気ですか？')).toBe('こんにちは、元気ですか？');
    });
  });
});
