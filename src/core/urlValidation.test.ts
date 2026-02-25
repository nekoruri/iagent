import { describe, it, expect } from 'vitest';
import { validateUrl, getUrlValidationError, UrlValidationError } from './urlValidation';

describe('validateUrl', () => {
  it('HTTPS URL を正規化して返す', () => {
    expect(validateUrl('https://example.com/mcp')).toBe('https://example.com/mcp');
  });

  it('末尾スラッシュを除去する', () => {
    expect(validateUrl('https://example.com/path/')).toBe('https://example.com/path');
    expect(validateUrl('https://example.com/path///')).toBe('https://example.com/path');
  });

  it('localhost は HTTP を許可する', () => {
    expect(validateUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(validateUrl('http://localhost:3000/mcp')).toBe('http://localhost:3000/mcp');
  });

  it('localhost は HTTPS も許可する', () => {
    expect(validateUrl('https://localhost:3000')).toBe('https://localhost:3000');
  });

  it('HTTP URL（非 localhost）を拒否する', () => {
    expect(() => validateUrl('http://example.com/mcp')).toThrow(UrlValidationError);
    expect(() => validateUrl('http://example.com/mcp')).toThrow('https: プロトコルが必要です');
  });

  it('不正な URL を拒否する', () => {
    expect(() => validateUrl('not-a-url')).toThrow(UrlValidationError);
    expect(() => validateUrl('not-a-url')).toThrow('URL の形式が正しくありません');
  });

  it('空文字列を拒否する', () => {
    expect(() => validateUrl('')).toThrow(UrlValidationError);
  });

  it('ftp: プロトコルを拒否する', () => {
    expect(() => validateUrl('ftp://example.com')).toThrow(UrlValidationError);
  });
});

describe('getUrlValidationError', () => {
  it('有効な URL では null を返す', () => {
    expect(getUrlValidationError('https://example.com')).toBeNull();
    expect(getUrlValidationError('http://localhost:3000')).toBeNull();
  });

  it('無効な URL ではエラーメッセージを返す', () => {
    expect(getUrlValidationError('http://example.com')).toBe('URL は https: プロトコルが必要です（localhost を除く）');
    expect(getUrlValidationError('not-a-url')).toBe('URL の形式が正しくありません');
  });
});
