import { test, expect } from '@playwright/test';
import { createSSEResponseWithToolCall } from './fixtures/api-mocks';
import { injectConfig, waitForAppReady, ensureConversation, sendChatMessage } from './fixtures/test-helpers';

test.describe('ツール実行 UI', () => {
  test.beforeEach(async ({ page }) => {
    await injectConfig(page);
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);
  });

  test('ツール実行中に ToolIndicator が表示され、完了後にテキスト応答が表示される', async ({ page }) => {
    const body = createSSEResponseWithToolCall(
      'calendar',
      '{"action":"list","date":"2026-03-02"}',
      '{"events":[{"title":"定例MTG","date":"2026-03-02","time":"10:00"}]}',
      '今日の予定は10:00から定例MTGがあります。',
    );

    await page.route('**/api.openai.com/v1/responses**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body,
      });
    });

    await sendChatMessage(page, '今日の予定は？');

    // アシスタントの応答に最終テキストが含まれる
    await expect(page.locator('.message-assistant')).toContainText('定例MTG', { timeout: 15000 });

    // ユーザーメッセージも表示されている
    await expect(page.locator('.message-user')).toContainText('今日の予定は？');
  });

  test('複数ツールの連続呼び出しでもテキスト応答が表示される', async ({ page }) => {
    // web_search ツール呼び出し → テキスト応答
    const body = createSSEResponseWithToolCall(
      'web_search',
      '{"query":"最新ニュース"}',
      '{"results":[{"title":"テストニュース","url":"https://example.com","description":"テスト"}]}',
      'テストニュースが見つかりました。',
    );

    await page.route('**/api.openai.com/v1/responses**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body,
      });
    });

    await sendChatMessage(page, '最新ニュースを検索して');

    await expect(page.locator('.message-assistant')).toContainText('テストニュース', { timeout: 15000 });
  });
});
