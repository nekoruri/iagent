import {
  MAX_FILE_SIZE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  SUPPORTED_IMAGE_TYPES,
} from '../types/attachment';

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

/** 画像のサムネイル生成（Canvas リサイズ） */
export function generateThumbnail(
  dataUri: string,
  maxSize = 200,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
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
        reject(new Error('Canvas コンテキストの取得に失敗しました'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = dataUri;
  });
}

/** ファイルサイズを人間が読みやすい形式に変換 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
