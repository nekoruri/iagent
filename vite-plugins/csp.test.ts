import { describe, it, expect } from 'vitest';
import { cspPlugin, CSP_POLICY } from './csp';
import type { IndexHtmlTransformContext } from 'vite';

describe('cspPlugin', () => {
  const plugin = cspPlugin();
  // transformIndexHtml はオブジェクト形式で定義されている
  const transformConfig = plugin.transformIndexHtml as {
    order: string;
    handler: (html: string, ctx: IndexHtmlTransformContext) => unknown;
  };
  const handler = transformConfig.handler;

  it('プラグイン名が正しい', () => {
    expect(plugin.name).toBe('iagent-csp');
  });

  it('order が post である', () => {
    expect(transformConfig.order).toBe('post');
  });

  it('本番ビルド時に CSP meta タグを返す', () => {
    const ctx = {
      path: '/index.html',
      filename: '/dist/index.html',
      server: undefined,
      bundle: {},
      chunk: undefined,
    } as unknown as IndexHtmlTransformContext;

    const result = handler('', ctx);
    expect(result).toEqual([
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: CSP_POLICY,
        },
        injectTo: 'head',
      },
    ]);
  });

  it('開発サーバー時は空配列を返す（CSP 非適用）', () => {
    const ctx = {
      path: '/index.html',
      filename: '/index.html',
      server: { config: {} }, // dev サーバーが存在
      bundle: undefined,
      chunk: undefined,
    } as unknown as IndexHtmlTransformContext;

    const result = handler('', ctx);
    expect(result).toEqual([]);
  });
});

describe('CSP_POLICY', () => {
  it('必須ディレクティブを含む', () => {
    expect(CSP_POLICY).toContain("default-src 'self'");
    expect(CSP_POLICY).toContain("script-src 'self'");
    expect(CSP_POLICY).toContain("style-src 'self'");
    expect(CSP_POLICY).toContain("connect-src 'self' https:");
    expect(CSP_POLICY).toContain("form-action 'none'");
    expect(CSP_POLICY).toContain("frame-ancestors 'none'");
  });
});
