import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { ToolIndicator } from './ToolIndicator';
import { TaskProgress } from './TaskProgress';
import { InputBar } from './InputBar';
import type { ChatMessage, ToolCallInfo } from '../types';

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeTools: ToolCallInfo[];
  isOnline: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function ChatView({ messages, isStreaming, activeTools, isOnline, onSend, onStop }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTools]);

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
          <MessageBubble key={msg.id} message={msg} />
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
