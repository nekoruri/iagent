import { describe, it, expect } from 'vitest';
import { validateUrl, getUrlValidationError, UrlValidationError, isPrivateIP } from './urlValidation';

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

  // --- プライベート IP テスト ---

  it('プライベート IP (192.168.x.x) を拒否する', () => {
    expect(() => validateUrl('https://192.168.1.1')).toThrow(UrlValidationError);
    expect(() => validateUrl('https://192.168.1.1')).toThrow('プライベート IP');
  });

  it('プライベート IP (10.x.x.x) を拒否する', () => {
    expect(() => validateUrl('https://10.0.0.1/path')).toThrow(UrlValidationError);
    expect(() => validateUrl('https://10.0.0.1/path')).toThrow('プライベート IP');
  });

  it('プライベート IP (172.16-31.x.x) を拒否する', () => {
    expect(() => validateUrl('https://172.16.0.1')).toThrow(UrlValidationError);
  });

  it('プライベート IP (127.0.0.1) を拒否する', () => {
    expect(() => validateUrl('https://127.0.0.1')).toThrow(UrlValidationError);
  });

  it('プライベート IP (0.0.0.0) を拒否する', () => {
    expect(() => validateUrl('https://0.0.0.0')).toThrow(UrlValidationError);
  });

  it('パブリック IP は許可する', () => {
    expect(validateUrl('https://8.8.8.8')).toBe('https://8.8.8.8');
    expect(validateUrl('https://203.0.113.1/path')).toBe('https://203.0.113.1/path');
  });
});

// --- isPrivateIP ---

describe('isPrivateIP', () => {
  it('localhost を検出する', () => {
    expect(isPrivateIP('localhost')).toBe(true);
    expect(isPrivateIP('[::1]')).toBe(true);
  });

  it('127.x.x.x を検出する', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true);
    expect(isPrivateIP('127.255.255.255')).toBe(true);
  });

  it('10.x.x.x を検出する', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true);
    expect(isPrivateIP('10.255.255.255')).toBe(true);
  });

  it('172.16-31.x.x を検出する', () => {
    expect(isPrivateIP('172.16.0.1')).toBe(true);
    expect(isPrivateIP('172.31.255.255')).toBe(true);
    expect(isPrivateIP('172.15.0.1')).toBe(false);
    expect(isPrivateIP('172.32.0.1')).toBe(false);
  });

  it('192.168.x.x を検出する', () => {
    expect(isPrivateIP('192.168.0.1')).toBe(true);
    expect(isPrivateIP('192.168.255.255')).toBe(true);
  });

  it('169.254.x.x (リンクローカル) を検出する', () => {
    expect(isPrivateIP('169.254.0.1')).toBe(true);
  });

  it('0.0.0.0 を検出する', () => {
    expect(isPrivateIP('0.0.0.0')).toBe(true);
  });

  it('パブリック IP を許可する', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false);
    expect(isPrivateIP('203.0.113.1')).toBe(false);
  });

  it('通常のホスト名を許可する', () => {
    expect(isPrivateIP('example.com')).toBe(false);
    expect(isPrivateIP('api.example.com')).toBe(false);
  });

  // IPv6
  it('IPv6 ループバック (::1) を検出する', () => {
    expect(isPrivateIP('::1')).toBe(true);
    expect(isPrivateIP('[::1]')).toBe(true);
  });

  it('IPv6 未指定アドレス (::) を検出する', () => {
    expect(isPrivateIP('::')).toBe(true);
  });

  it('IPv6 ULA (fc00::/7) を検出する', () => {
    expect(isPrivateIP('fc00::1')).toBe(true);
    expect(isPrivateIP('fd12:3456:789a::1')).toBe(true);
  });

  it('IPv6 リンクローカル (fe80::/10) を検出する', () => {
    expect(isPrivateIP('fe80::1')).toBe(true);
    expect(isPrivateIP('fe80::a1:b2c3')).toBe(true);
  });

  it('IPv4-mapped IPv6 のプライベート IP を検出する', () => {
    expect(isPrivateIP('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
  });

  it('IPv4-mapped IPv6 のパブリック IP を許可する', () => {
    expect(isPrivateIP('::ffff:8.8.8.8')).toBe(false);
  });

  it('IPv4-mapped IPv6 の16進表記プライベート IP を検出する', () => {
    expect(isPrivateIP('::ffff:c0a8:0101')).toBe(true);  // 192.168.1.1
    expect(isPrivateIP('::ffff:7f00:1')).toBe(true);      // 127.0.0.1
    expect(isPrivateIP('::ffff:0a00:1')).toBe(true);      // 10.0.0.1
  });

  it('IPv4-mapped IPv6 の16進表記パブリック IP を許可する', () => {
    expect(isPrivateIP('::ffff:0808:0808')).toBe(false);  // 8.8.8.8
  });

  it('IPv6 パブリックアドレスを許可する', () => {
    expect(isPrivateIP('2001:db8::1')).toBe(false);
    expect(isPrivateIP('2607:f8b0:4004:800::200e')).toBe(false);
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
