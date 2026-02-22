import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ChatMessage } from '../types';

marked.setOptions({
  breaks: true,
});

function renderMarkdown(text: string): string {
  const raw = marked.parse(text) as string;
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target'],
  });
}

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  const html = useMemo(() => {
    if (isUser || !message.content) return '';
    return renderMarkdown(message.content);
  }, [isUser, message.content]);

  const isHeartbeat = message.source === 'heartbeat';

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}${isHeartbeat ? ' message-heartbeat' : ''}`}>
      <div className="message-bubble">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="tool-calls">
            {message.toolCalls.map((tc) => (
              <span key={tc.id} className={`tool-badge tool-${tc.status}`}>
                {tc.name}
              </span>
            ))}
          </div>
        )}
        {isUser ? (
          <div className="message-content">{message.content}</div>
        ) : (
          <div
            className="message-content markdown"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
