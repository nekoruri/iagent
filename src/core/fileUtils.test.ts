import { describe, it, expect } from 'vitest';
import {
  isImageMimeType,
  validateFile,
  validateAttachmentCount,
  sanitizeFilename,
  formatFileSize,
} from './fileUtils';

describe('isImageMimeType', () => {
  it.each([
    ['image/jpeg', true],
    ['image/png', true],
    ['image/gif', true],
    ['image/webp', true],
    ['application/pdf', false],
    ['text/plain', false],
    ['image/svg+xml', false],
  ])('%s → %s', (mimeType, expected) => {
    expect(isImageMimeType(mimeType)).toBe(expected);
  });
});

describe('validateFile', () => {
  it('正常なファイルは valid', () => {
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('空ファイルはエラー', () => {
    const file = new File([], 'empty.txt', { type: 'text/plain' });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('空です');
  });

  it('サイズ超過はエラー', () => {
    // 21MB のダミーデータ
    const data = new Uint8Array(21 * 1024 * 1024);
    const file = new File([data], 'large.bin', { type: 'application/octet-stream' });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('20MB');
  });

  it('許可されていない MIME タイプはエラー', () => {
    const file = new File(['<svg></svg>'], 'test.svg', { type: 'image/svg+xml' });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('image/svg+xml');
  });

  it.each([
    ['image/jpeg'],
    ['image/png'],
    ['application/pdf'],
    ['text/plain'],
    ['text/csv'],
    ['text/markdown'],
    ['application/vnd.ms-excel'],  // .csv のブラウザ/OS バリアント
  ])('許可された MIME タイプ %s は valid', (mimeType) => {
    const file = new File(['content'], 'test', { type: mimeType });
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('MIME タイプが空（不明）の場合は通過する', () => {
    const file = new File(['content'], 'unknown');
    expect(validateFile(file)).toEqual({ valid: true });
  });
});

describe('validateAttachmentCount', () => {
  it('上限未満は valid', () => {
    expect(validateAttachmentCount(0)).toEqual({ valid: true });
    expect(validateAttachmentCount(4)).toEqual({ valid: true });
  });

  it('上限に達したらエラー', () => {
    const result = validateAttachmentCount(5);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('5件');
  });
});

describe('sanitizeFilename', () => {
  it('パス区切り文字を除去する', () => {
    expect(sanitizeFilename('path/to/file.txt')).toBe('path_to_file.txt');
    expect(sanitizeFilename('path\\to\\file.txt')).toBe('path_to_file.txt');
    expect(sanitizeFilename('../../../etc/passwd')).toBe('.._.._.._etc_passwd');
  });

  it('255 文字に切り詰める', () => {
    const longName = 'a'.repeat(300) + '.txt';
    expect(sanitizeFilename(longName).length).toBe(255);
  });

  it('通常のファイル名はそのまま', () => {
    expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
  });
});

describe('formatFileSize', () => {
  it.each([
    [0, '0B'],
    [512, '512B'],
    [1024, '1.0KB'],
    [1536, '1.5KB'],
    [1048576, '1.0MB'],
    [1572864, '1.5MB'],
  ])('%d bytes → %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});
