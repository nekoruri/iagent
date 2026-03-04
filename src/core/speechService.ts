/**
 * Web Speech API ユーティリティ関数群
 * SpeechRecognition（STT）と SpeechSynthesis（TTS）のラッパー
 */

/** SpeechRecognition API が利用可能か */
export function isSpeechRecognitionSupported(): boolean {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** SpeechSynthesis API が利用可能か */
export function isSpeechSynthesisSupported(): boolean {
  return !!window.speechSynthesis;
}

const VALID_SPEECH_LANGS = ['ja-JP', 'en-US', 'en-GB', 'zh-CN', 'ko-KR'];

/** SpeechRecognition インスタンスを生成 */
export function createSpeechRecognition(lang: string): SpeechRecognition {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    throw new Error('SpeechRecognition API は利用できません');
  }
  const recognition = new SpeechRecognitionCtor();
  recognition.lang = VALID_SPEECH_LANGS.includes(lang) ? lang : 'ja-JP';
  recognition.continuous = false;
  recognition.interimResults = true;
  return recognition;
}

/** SpeechSynthesisUtterance を生成 */
export function createUtterance(
  text: string,
  options: { lang: string; rate: number },
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.lang;
  utterance.rate = options.rate;
  return utterance;
}

/** 読み上げをキャンセル */
export function cancelSpeech(): void {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/** 利用可能な音声一覧を取得 */
export function getAvailableVoices(lang?: string): SpeechSynthesisVoice[] {
  if (!window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  if (lang) {
    return voices.filter((v) => v.lang.startsWith(lang.split('-')[0]));
  }
  return voices;
}

/** Markdown 記法を除去してプレーンテキストに変換（TTS 向け） */
export function stripMarkdown(text: string): string {
  return text
    // コードブロック（```...```）
    .replace(/```[\s\S]*?```/g, '')
    // インラインコード（`...`）
    .replace(/`[^`]+`/g, '')
    // 画像（![alt](url)）
    .replace(/!\[.*?\]\(.*?\)/g, '')
    // リンク（[text](url)） → text のみ残す
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
    // 見出し（# ）
    .replace(/^#{1,6}\s+/gm, '')
    // 太字・斜体（**text**, *text*, __text__, _text_）
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
    // 水平線（---, ***）
    .replace(/^[-*]{3,}\s*$/gm, '')
    // リスト記号（- , * , 1. ）
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // 引用（> ）
    .replace(/^>\s+/gm, '')
    // 連続空行を 1 行に圧縮
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
