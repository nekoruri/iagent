import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { ToolIndicator } from './ToolIndicator';
import { TaskProgress } from './TaskProgress';
import { InputBar } from './InputBar';
import { getAttachmentsByMessageIds } from '../store/attachmentStore';
import type { ChatMessage, ToolCallInfo } from '../types';
import type { Attachment } from '../types/attachment';
import type { PendingAttachment } from '../types/attachment';
import type { SpeechOutputState } from '../hooks/useSpeechOutput';

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeTools: ToolCallInfo[];
  isOnline: boolean;
  onSend: (text: string, attachments?: PendingAttachment[]) => void | Promise<void>;
  onStop: () => void;
  webSpeechLang?: string;
  webSpeechSttEnabled?: boolean;
  webSpeechTtsEnabled?: boolean;
  speechOutput?: SpeechOutputState;
}

export function ChatView({ messages, isStreaming, activeTools, isOnline, onSend, onStop, webSpeechLang, webSpeechSttEnabled, webSpeechTtsEnabled, speechOutput }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [attachmentMap, setAttachmentMap] = useState<Record<string, Attachment[]>>({});
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const handleSpeak = useCallback((msgId: string, text: string) => {
    setSpeakingMessageId(msgId);
    speechOutput?.speak(text);
  }, [speechOutput]);

  const handleStopSpeak = useCallback(() => {
    setSpeakingMessageId(null);
    speechOutput?.stop();
  }, [speechOutput]);
  // ロード済み or ロード中の ID を追跡（ストリーミング中の重複フェッチ防止）
  const loadedOrLoadingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTools]);

  // 添付を持つメッセージの添付データを遅延ロード
  useEffect(() => {
    const msgIds = messages
      .filter((m) => m.attachmentIds && m.attachmentIds.length > 0)
      .map((m) => m.id)
      .filter((id) => !loadedOrLoadingRef.current.has(id));

    if (msgIds.length === 0) return;

    // ロード中としてマーク（次回の effect で重複フェッチしない）
    for (const id of msgIds) {
      loadedOrLoadingRef.current.add(id);
    }

    getAttachmentsByMessageIds(msgIds).then((grouped) => {
      setAttachmentMap((prev) => {
        return { ...prev, ...grouped };
      });
    }).catch(() => {
      // 読み取り失敗時はロード中マークを外してリトライ可能にする
      for (const id of msgIds) {
        loadedOrLoadingRef.current.delete(id);
      }
    });
  }, [messages]);

  return (
    <div className="chat-view">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <h2>iAgent</h2>
            <p>AIアシスタントに話しかけてみましょう</p>
            <div className="chat-suggestions">
              <button onClick={() => { void onSend('こんにちは！何ができますか？'); }} disabled={!isOnline}>
                こんにちは！何ができますか？
              </button>
              <button onClick={() => { void onSend('バッテリー残量を教えて'); }} disabled={!isOnline}>
                バッテリー残量を教えて
              </button>
              <button onClick={() => { void onSend('最新のテクノロジーニュースを検索して'); }} disabled={!isOnline}>
                最新ニュースを検索
              </button>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            attachments={attachmentMap[msg.id]}
            onSpeak={(text) => handleSpeak(msg.id, text)}
            onStopSpeak={handleStopSpeak}
            isSpeaking={speechOutput?.isSpeaking && speakingMessageId === msg.id}
            ttsSupported={!!speechOutput?.isSupported && !!webSpeechTtsEnabled}
          />
        ))}
        {activeTools.length >= 2 ? (
          <TaskProgress tools={activeTools} />
        ) : (
          <ToolIndicator tools={activeTools} />
        )}
        <div ref={bottomRef} />
      </div>
      <InputBar onSend={onSend} disabled={isStreaming || !isOnline} isStreaming={isStreaming} onStop={onStop} isOnline={isOnline} webSpeechLang={webSpeechLang} webSpeechSttEnabled={webSpeechSttEnabled} />
    </div>
  );
}
