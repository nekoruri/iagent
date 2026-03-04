import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { isImageMimeType, formatFileSize } from '../core/fileUtils';
import type { ChatMessage } from '../types';
import type { Attachment } from '../types/attachment';

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
  attachments?: Attachment[];
}

export function MessageBubble({ message, attachments }: Props) {
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
        {attachments && attachments.length > 0 && (
          <div className="message-attachments">
            {attachments.map((att) => (
              <div key={att.id} className="message-attachment">
                {isImageMimeType(att.mimeType) ? (
                  <img
                    src={att.thumbnailUri ?? att.dataUri}
                    alt={att.filename}
                    className="message-attachment-image"
                    onClick={() => {
                      // data URI → Blob URL で開く（メモリ効率改善）
                      const byteString = atob(att.dataUri.split(',')[1]);
                      const mimeMatch = att.dataUri.match(/data:([^;]+);/);
                      const mime = mimeMatch ? mimeMatch[1] : att.mimeType;
                      const ab = new ArrayBuffer(byteString.length);
                      const ia = new Uint8Array(ab);
                      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                      const blob = new Blob([ab], { type: mime });
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank');
                      setTimeout(() => URL.revokeObjectURL(url), 30000);
                    }}
                  />
                ) : (
                  <div className="message-attachment-file">
                    <span className="message-attachment-icon">&#128206;</span>
                    <span className="message-attachment-name">{att.filename}</span>
                    <span className="message-attachment-size">{formatFileSize(att.size)}</span>
                  </div>
                )}
              </div>
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
