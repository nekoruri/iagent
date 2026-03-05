import {
  MAX_FILE_SIZE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  SUPPORTED_IMAGE_TYPES,
  ALLOWED_MIME_TYPES,
} from '../types/attachment';
import type { ThumbnailWorkerCommand, ThumbnailWorkerEvent } from '../workers/thumbnailWorkerProtocol';

const THUMBNAIL_WORKER_TIMEOUT_MS = 10_000;
let thumbnailWorker: Worker | null = null;
let thumbnailWorkerRequestId = 0;
const thumbnailWorkerPending = new Map<number, {
  resolve: (value: string) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

/** MIME タイプが画像かどうか判定 */
export function isImageMimeType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType);
}

/** ファイルバリデーション結果 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/** ファイルサイズと MIME タイプのバリデーション */
export function validateFile(file: File): FileValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    const maxMB = MAX_FILE_SIZE / (1024 * 1024);
    return { valid: false, error: `ファイルサイズが上限（${maxMB}MB）を超えています` };
  }
  if (file.size === 0) {
    return { valid: false, error: 'ファイルが空です' };
  }
  if (!file.type || !ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: file.type ? `このファイル形式（${file.type}）には対応していません` : 'このファイル形式には対応していません' };
  }
  return { valid: true };
}

/** 添付数の上限チェック */
export function validateAttachmentCount(currentCount: number): FileValidationResult {
  if (currentCount >= MAX_ATTACHMENTS_PER_MESSAGE) {
    return { valid: false, error: `添付は最大${MAX_ATTACHMENTS_PER_MESSAGE}件までです` };
  }
  return { valid: true };
}

/** File → data URI 変換 */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
}

/** File/Blob → テキスト変換（File.text 未対応環境は FileReader を使用） */
export function readFileAsText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('テキストファイルの読み込みに失敗しました'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('テキストファイルの読み込みに失敗しました'));
    reader.readAsText(file);
  });
}

function supportsThumbnailWorker(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

function clearThumbnailWorker(): void {
  if (thumbnailWorkerPending.size > 0) return;
  if (!thumbnailWorker) return;
  thumbnailWorker.terminate();
  thumbnailWorker = null;
}

function failPendingThumbnailRequest(
  requestId: number,
  message: string,
): void {
  const pending = thumbnailWorkerPending.get(requestId);
  if (!pending) return;
  clearTimeout(pending.timer);
  thumbnailWorkerPending.delete(requestId);
  pending.reject(new Error(message));
  clearThumbnailWorker();
}

function ensureThumbnailWorker(): Worker {
  if (thumbnailWorker) return thumbnailWorker;

  thumbnailWorker = new Worker(
    new URL('../workers/thumbnail.worker.ts', import.meta.url),
    { type: 'module' },
  );
  thumbnailWorker.onmessage = (event: MessageEvent<ThumbnailWorkerEvent>) => {
    const response = event.data;
    if (response?.type === 'thumbnail-success') {
      const pending = thumbnailWorkerPending.get(response.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      thumbnailWorkerPending.delete(response.requestId);
      pending.resolve(response.thumbnailUri);
      clearThumbnailWorker();
      return;
    }
    if (response?.type === 'thumbnail-error') {
      failPendingThumbnailRequest(response.requestId, response.error || 'worker-thumbnail-generate-failed');
    }
  };
  thumbnailWorker.onerror = () => {
    const pendingIds = [...thumbnailWorkerPending.keys()];
    for (const requestId of pendingIds) {
      failPendingThumbnailRequest(requestId, 'worker-thumbnail-error');
    }
    clearThumbnailWorker();
  };

  return thumbnailWorker;
}

function generateThumbnailViaWorker(dataUri: string, maxSize: number): Promise<string> {
  const worker = ensureThumbnailWorker();
  const requestId = ++thumbnailWorkerRequestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      failPendingThumbnailRequest(requestId, 'worker-thumbnail-timeout');
    }, THUMBNAIL_WORKER_TIMEOUT_MS);

    thumbnailWorkerPending.set(requestId, { resolve, reject, timer });
    const command: ThumbnailWorkerCommand = {
      type: 'thumbnail-generate',
      requestId,
      dataUri,
      maxSize,
    };
    worker.postMessage(command);
  });
}

function generateThumbnailOnMainThread(
  dataUri: string,
  maxSize = 200,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };
    img.onload = () => {
      try {
        const { width, height } = img;
        let w = width;
        let h = height;

        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Canvas コンテキストの取得に失敗しました'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const thumbnailUri = canvas.toDataURL('image/jpeg', 0.7);
        canvas.width = 0;
        canvas.height = 0;
        cleanup();
        resolve(thumbnailUri);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('画像の読み込みに失敗しました'));
    };
    img.src = dataUri;
  });
}

/** 画像のサムネイル生成（Canvas リサイズ） */
export function generateThumbnail(
  dataUri: string,
  maxSize = 200,
): Promise<string> {
  if (supportsThumbnailWorker()) {
    return generateThumbnailViaWorker(dataUri, maxSize)
      .catch(() => generateThumbnailOnMainThread(dataUri, maxSize));
  }
  return generateThumbnailOnMainThread(dataUri, maxSize);
}

/** ファイル名のサニタイズ（パス区切り除去 + 長さ制限） */
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').slice(0, 255);
}

/** ファイルサイズを人間が読みやすい形式に変換 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
