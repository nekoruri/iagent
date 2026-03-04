/** ファイル添付（IndexedDB 永続化用） */
export interface Attachment {
  id: string;
  messageId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  size: number;
  dataUri: string;           // data:image/jpeg;base64,...
  thumbnailUri?: string;     // 画像のみ（Canvas リサイズ max 200px）
  createdAt: number;
}

/** InputBar → sendMessage に渡す一時的な添付情報（DB 保存前） */
export interface PendingAttachment {
  id: string;
  file: File;
  dataUri: string;
  thumbnailUri?: string;
}

// サイズ・件数制限
export const MAX_FILE_SIZE = 20 * 1024 * 1024;       // 20MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

// 対応 MIME タイプ
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

// 許可する MIME タイプのホワイトリスト
export const ALLOWED_MIME_TYPES = [
  ...SUPPORTED_IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.ms-excel',  // .csv のブラウザ/OS バリアント
];
