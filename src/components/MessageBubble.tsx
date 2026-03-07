import { memo, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { isImageMimeType, formatFileSize } from '../core/fileUtils';
import type { ChatMessage } from '../types';
import type { Attachment } from '../types/attachment';
import { AttachmentImage } from './AttachmentImage';
import { ExplanationDisclosure } from './ExplanationDisclosure';

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
  onSpeak?: (text: string) => void;
  onStopSpeak?: () => void;
  isSpeaking?: boolean;
  ttsSupported?: boolean;
}

export const MessageBubble = memo(function MessageBubble({ message, attachments, onSpeak, onStopSpeak, isSpeaking, ttsSupported }: Props) {
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
                  <AttachmentImage
                    key={`${att.id}:${att.thumbnailUri ?? att.dataUri}:${att.dataUri}`}
                    previewSrc={att.thumbnailUri ?? att.dataUri}
                    fallbackSrc={att.dataUri}
                    alt={att.filename}
                    imgClassName="message-attachment-image"
                    fallbackClassName="attachment-image-fallback message-attachment-fallback"
                    onClick={() => {
                      try {
                        if (!att.dataUri.startsWith('data:')) return;
                        const parts = att.dataUri.split(',');
                        if (parts.length < 2) return;
                        const byteString = atob(parts[1]);
                        const mimeMatch = att.dataUri.match(/data:([^;]+);/);
                        const mime = mimeMatch ? mimeMatch[1] : att.mimeType;
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const blob = new Blob([ab], { type: mime });
                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank', 'noopener,noreferrer');
                        setTimeout(() => URL.revokeObjectURL(url), 30000);
                      } catch {
                        // dataUri のデコード失敗時は無視
                      }
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
          <>
            <div
              className="message-content markdown"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            {message.explanationWhyNow && (
              <ExplanationDisclosure
                className="message-explanation-card"
                toggleClassName="explanation-disclosure-toggle"
                bodyClassName="message-explanation-body"
                titleClassName="message-explanation-title"
                textClassName="message-explanation-text"
                labelClassName="message-explanation-label"
                title={message.explanationTitle}
                whyNow={message.explanationWhyNow}
                outcome={message.explanationOutcome}
              />
            )}
          </>
        )}
        {!isUser && ttsSupported && message.content && (
          <button
            className={`btn-icon btn-tts${isSpeaking ? ' tts-active' : ''}`}
            onClick={() => isSpeaking ? onStopSpeak?.() : onSpeak?.(message.content)}
            title={isSpeaking ? '読み上げ停止' : '読み上げ'}
            aria-label={isSpeaking ? '読み上げ停止' : '読み上げ'}
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isSpeaking ? (
                <>
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});
