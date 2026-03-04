import { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { ToolIndicator } from './ToolIndicator';
import { TaskProgress } from './TaskProgress';
import { InputBar } from './InputBar';
import { getAttachmentsByMessageId } from '../store/attachmentStore';
import type { ChatMessage, ToolCallInfo } from '../types';
import type { Attachment } from '../types/attachment';
import type { PendingAttachment } from '../types/attachment';

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeTools: ToolCallInfo[];
  isOnline: boolean;
  onSend: (text: string, attachments?: PendingAttachment[]) => void;
  onStop: () => void;
}

export function ChatView({ messages, isStreaming, activeTools, isOnline, onSend, onStop }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [attachmentMap, setAttachmentMap] = useState<Record<string, Attachment[]>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTools]);

  // 添付を持つメッセージの添付データを遅延ロード
  useEffect(() => {
    const msgIds = messages
      .filter((m) => m.attachmentIds && m.attachmentIds.length > 0)
      .map((m) => m.id)
      .filter((id) => !(id in attachmentMap));

    if (msgIds.length === 0) return;

    Promise.all(
      msgIds.map(async (id) => {
        const atts = await getAttachmentsByMessageId(id);
        return [id, atts] as const;
      }),
    ).then((results) => {
      setAttachmentMap((prev) => {
        const next = { ...prev };
        for (const [id, atts] of results) {
          next[id] = atts;
        }
        return next;
      });
    });
  }, [messages, attachmentMap]);

  return (
    <div className="chat-view">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <h2>iAgent</h2>
            <p>AIアシスタントに話しかけてみましょう</p>
            <div className="chat-suggestions">
              <button onClick={() => onSend('こんにちは！何ができますか？')} disabled={!isOnline}>
                こんにちは！何ができますか？
              </button>
              <button onClick={() => onSend('バッテリー残量を教えて')} disabled={!isOnline}>
                バッテリー残量を教えて
              </button>
              <button onClick={() => onSend('最新のテクノロジーニュースを検索して')} disabled={!isOnline}>
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
          />
        ))}
        {activeTools.length >= 2 ? (
          <TaskProgress tools={activeTools} />
        ) : (
          <ToolIndicator tools={activeTools} />
        )}
        <div ref={bottomRef} />
      </div>
      <InputBar onSend={onSend} disabled={isStreaming || !isOnline} isStreaming={isStreaming} onStop={onStop} isOnline={isOnline} />
    </div>
  );
}
