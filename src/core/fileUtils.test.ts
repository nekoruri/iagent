import { describe, it, expect } from 'vitest';
import {
  isImageMimeType,
  validateFile,
  validateAttachmentCount,
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
