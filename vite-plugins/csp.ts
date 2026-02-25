import type { Plugin, IndexHtmlTransformContext } from 'vite';

/** CSP ポリシーディレクティブ */
export const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * 本番ビルド時のみ CSP meta タグを注入する Vite プラグイン。
 * 開発サーバーは HMR 用インラインスクリプトを注入するため、CSP を適用しない。
 */
export function cspPlugin(): Plugin {
  return {
    name: 'iagent-csp',
    transformIndexHtml: {
      order: 'post',
      handler(_html: string, ctx: IndexHtmlTransformContext) {
        // 開発サーバー時はスキップ（ctx.server が存在する = dev モード）
        if (ctx.server) {
          return [];
        }
        return [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: CSP_POLICY,
            },
            injectTo: 'head' as const,
          },
        ];
      },
    },
  };
}
