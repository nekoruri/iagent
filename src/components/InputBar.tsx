import { useState, useRef, useCallback } from 'react';
import type { PendingAttachment } from '../types/attachment';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '../types/attachment';
import {
  fileToDataUri,
  generateThumbnail,
  isImageMimeType,
  validateFile,
  validateAttachmentCount,
  formatFileSize,
} from '../core/fileUtils';

interface Props {
  onSend: (text: string, attachments?: PendingAttachment[]) => void;
  disabled: boolean;
  isStreaming: boolean;
  onStop: () => void;
  isOnline?: boolean;
}

export function InputBar({ onSend, disabled, isStreaming, onStop, isOnline = true }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  const handleSend = useCallback(() => {
    if (!hasContent || disabled) return;
    onSend(text.trim(), attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
    setAttachError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, attachments, hasContent, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setAttachError(null);
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      // 件数チェック
      const countResult = validateAttachmentCount(attachments.length);
      if (!countResult.valid) {
        setAttachError(countResult.error!);
        break;
      }

      // ファイルバリデーション
      const fileResult = validateFile(file);
      if (!fileResult.valid) {
        setAttachError(fileResult.error!);
        continue;
      }

      try {
        const dataUri = await fileToDataUri(file);
        let thumbnailUri: string | undefined;

        if (isImageMimeType(file.type)) {
          try {
            thumbnailUri = await generateThumbnail(dataUri);
          } catch {
            // サムネイル生成失敗は無視（元画像を表示に使う）
          }
        }

        const pending: PendingAttachment = {
          id: crypto.randomUUID(),
          file,
          dataUri,
          thumbnailUri,
        };

        setAttachments((prev) => {
          if (prev.length >= MAX_ATTACHMENTS_PER_MESSAGE) return prev;
          return [...prev, pending];
        });
      } catch (error) {
        console.error('[InputBar] ファイル読み込みエラー:', error);
        setAttachError('ファイルの読み込みに失敗しました');
      }
    }
  }, [attachments.length]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
    // 同じファイルを再選択できるようにリセット
    e.target.value = '';
  }, [addFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }, [addFiles]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setAttachError(null);
  }, []);

  return (
    <div className="input-bar">
      {attachments.length > 0 && (
        <div className="attachment-preview-list">
          {attachments.map((att) => (
            <div key={att.id} className="attachment-preview-item">
              {isImageMimeType(att.file.type) ? (
                <img
                  src={att.thumbnailUri ?? att.dataUri}
                  alt={att.file.name}
                  className="attachment-preview-img"
                />
              ) : (
                <div className="attachment-file-icon">
                  <span className="attachment-file-emoji">&#128206;</span>
                  <span className="attachment-file-name">{att.file.name}</span>
                  <span className="attachment-file-size">{formatFileSize(att.file.size)}</span>
                </div>
              )}
              <button
                className="attachment-remove"
                onClick={() => removeAttachment(att.id)}
                aria-label={`${att.file.name} を削除`}
                type="button"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      {attachError && (
        <div className="attachment-error" role="alert">{attachError}</div>
      )}
      <div className="input-bar-row">
        <button
          className="btn-icon btn-attach"
          onClick={() => fileInputRef.current?.click()}
          title="ファイルを添付"
          aria-label="ファイルを添付"
          type="button"
          disabled={disabled}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept="image/*,.pdf,.txt,.csv,.md"
          capture="environment"
          onChange={handleFileSelect}
        />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isOnline ? 'メッセージを入力...' : 'オフラインです — ネットワーク接続を確認してください'}
          rows={1}
          disabled={disabled}
        />
        {isStreaming ? (
          <button className="btn-stop" onClick={onStop}>
            &#9632;
          </button>
        ) : (
          <button onClick={handleSend} disabled={disabled || !hasContent}>
            送信
          </button>
        )}
      </div>
    </div>
  );
}
