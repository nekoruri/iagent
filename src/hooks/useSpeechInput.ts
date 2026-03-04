import { useState, useEffect, useRef, useCallback } from 'react';
import { isSpeechRecognitionSupported, createSpeechRecognition } from '../core/speechService';

export interface SpeechInputState {
  isSupported: boolean;
  isListening: boolean;
  interimText: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
}

/**
 * 音声入力（STT）フック
 * useOnlineStatus パターン（ブラウザ API + イベント + クリーンアップ）に準拠
 */
export function useSpeechInput(
  lang: string,
  onResult: (text: string) => void,
  enabled: boolean,
): SpeechInputState {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);
  const mountedRef = useRef(true);

  // ref 更新はレンダー中ではなく useEffect で行う（React Strict Mode 対応）
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const isSupported = isSpeechRecognitionSupported();

  // アンマウント時 or enabled=false 時にクリーンアップ
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled && recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    return () => {
      mountedRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, [enabled]);

  const startListening = useCallback(() => {
    if (!isSupported || !enabled) return;
    setError(null);
    setInterimText('');

    try {
      const recognition = createSpeechRecognition(lang);
      recognitionRef.current = recognition;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        if (!mountedRef.current) return;
        if (finalTranscript) {
          onResultRef.current(finalTranscript);
          setInterimText('');
        } else {
          setInterimText(interimTranscript);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (!mountedRef.current) return;
        if (event.error === 'not-allowed') {
          setError('マイクの使用が許可されていません。ブラウザの設定を確認してください。');
        } else if (event.error === 'no-speech') {
          // 無音の場合はエラーとしない
          setError(null);
        } else {
          setError(`音声認識エラー: ${event.error}`);
        }
        setIsListening(false);
        setInterimText('');
      };

      recognition.onend = () => {
        if (!mountedRef.current) return;
        setIsListening(false);
        setInterimText('');
        recognitionRef.current = null;
      };

      recognition.start();
      setIsListening(true);
    } catch (e) {
      setError(`音声認識の開始に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [isSupported, enabled, lang]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  return {
    isSupported,
    isListening,
    interimText,
    error,
    startListening,
    stopListening,
  };
}
