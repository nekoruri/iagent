import type { ChatMessage } from '../types';

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
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
        <div className="message-content">{message.content}</div>
      </div>
    </div>
  );
}
