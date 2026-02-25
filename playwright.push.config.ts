import { defineConfig, devices } from '@playwright/test';

/**
 * Push 通知統合テスト専用の Playwright 設定。
 *
 * 通常の E2E テスト（playwright.config.ts）とは分離されており、
 * `npm run test:e2e:push` で個別に実行する。
 *
 * CDP ServiceWorker.deliverPushMessage で SW に直接 Push を配信するため、
 * wrangler dev サーバーは不要。起動するサーバーは以下の2つ:
 * 1. Vite preview（VITE_OPENAI_API_URL 注入済みビルド）
 * 2. OpenAI モック HTTP サーバー（SW 内 Heartbeat の API 呼び出し先）
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /push-integration/,
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    serviceWorkers: 'allow',
    trace: 'on-first-retry',
    permissions: ['notifications'],
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'VITE_OPENAI_API_URL=http://localhost:4100/v1/chat/completions npm run build && npm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npx tsx e2e/fixtures/openai-mock-server.ts',
      url: 'http://localhost:4100/health',
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
  ],
});
