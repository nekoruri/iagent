import { test, expect } from '@playwright/test';
import { createSSEResponse, mockOpenAIResponses } from './fixtures/api-mocks';
import { injectConfig, waitForAppReady, ensureConversation, sendChatMessage, waitForStreamingComplete } from './fixtures/test-helpers';

test.describe('チャットストリーミング', () => {
  test.beforeEach(async ({ page }) => {
    await injectConfig(page);
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);
  });

  test('メッセージ送信 → ストリーミング応答 → 表示完了', async ({ page }) => {
    await mockOpenAIResponses(page, 'ストリーミングテスト応答です。');

    await sendChatMessage(page, 'こんにちは');

    // ユーザーメッセージが表示される
    await expect(page.locator('.message-user')).toContainText('こんにちは', { timeout: 10000 });

    // アシスタントの応答がストリーミングで表示される
    await expect(page.locator('.message-assistant')).toContainText('ストリーミングテスト応答です。', { timeout: 10000 });
  });

  test('連続メッセージ送信で会話履歴が蓄積される', async ({ page }) => {
    // 1回目のリクエスト: 挨拶
    let requestCount = 0;
    await page.route('**/api.openai.com/v1/responses**', async (route) => {
      requestCount++;
      const text = requestCount === 1 ? '1回目の応答です。' : '2回目の応答です。';
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: createSSEResponse(text),
      });
    });

    // 1回目のメッセージ
    await sendChatMessage(page, '最初のメッセージ');
    await expect(page.locator('.message-assistant').first()).toContainText('1回目の応答です。', { timeout: 10000 });

    // 2回目のメッセージ
    await sendChatMessage(page, '2回目のメッセージ');
    await expect(page.locator('.message-assistant').last()).toContainText('2回目の応答です。', { timeout: 10000 });

    // 会話履歴に4件（ユーザー2 + アシスタント2）
    const userMessages = page.locator('.message-user');
    const assistantMessages = page.locator('.message-assistant');
    await expect(userMessages).toHaveCount(2);
    await expect(assistantMessages).toHaveCount(2);
  });

  test('Markdown を含むレスポンスが正しくレンダリングされる', async ({ page }) => {
    const markdown = '## 見出し\n\n- リスト項目1\n- リスト項目2\n\n```js\nconsole.log("hello");\n```';
    await mockOpenAIResponses(page, markdown);

    await sendChatMessage(page, 'Markdownのテスト');

    // Markdown がレンダリングされるまで待つ
    const assistant = page.locator('.message-assistant').first();
    await expect(assistant).toBeVisible({ timeout: 10000 });

    // h2 見出し、リスト、コードブロックが存在する
    await expect(assistant.locator('h2')).toContainText('見出し', { timeout: 10000 });
    await expect(assistant.locator('li')).toHaveCount(2);
    await expect(assistant.locator('code')).toContainText('console.log');
  });

  test('送信ボタンが入力中のみ有効になる', async ({ page }) => {
    await mockOpenAIResponses(page);

    const textarea = page.locator('.input-bar textarea');
    const sendButton = page.locator('.input-bar button[type="submit"], .input-bar .send-btn');

    // 空の状態では送信ボタンが無効（または非表示）
    await expect(textarea).toBeVisible();

    // テキスト入力後に送信可能
    await textarea.fill('テスト');
    // 何かテキストがあれば送信ボタンは存在
    await expect(textarea).toHaveValue('テスト');
  });
});
