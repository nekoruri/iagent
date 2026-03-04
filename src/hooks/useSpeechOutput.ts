import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isSpeechSynthesisSupported,
  createUtterance,
  cancelSpeech,
  stripMarkdown,
} from '../core/speechService';

export interface SpeechOutputState {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
  voices: SpeechSynthesisVoice[];
}

/**
 * 音声出力（TTS）フック
 */
export function useSpeechOutput(
  lang: string,
  rate: number,
  enabled: boolean,
): SpeechOutputState {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const isSupported = isSpeechSynthesisSupported();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 音声一覧を取得（voiceschanged イベントで非同期取得）
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    // 一部ブラウザでは getVoices() が即座に返る
    loadVoices();

    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [isSupported]);

  // アンマウント時にキャンセル
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!isSupported || !enabled) return;

    // 既存の読み上げをキャンセル
    cancelSpeech();

    const plainText = stripMarkdown(text);
    if (!plainText) return;

    const utterance = createUtterance(plainText, { lang, rate });
    utteranceRef.current = utterance;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
    };

    window.speechSynthesis.speak(utterance);
  }, [isSupported, enabled, lang, rate]);

  const stop = useCallback(() => {
    cancelSpeech();
    setIsSpeaking(false);
    utteranceRef.current = null;
  }, []);

  return {
    isSupported,
    isSpeaking,
    speak,
    stop,
    voices,
  };
}
