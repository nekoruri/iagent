import { test, expect } from '@playwright/test';
import { mockOpenAIResponses } from './fixtures/api-mocks';
import { injectConfig, waitForAppReady, ensureConversation, sendChatMessage } from './fixtures/test-helpers';

test.describe('初回起動 → API キー設定 → チャット送信フロー', () => {
  test('API キー未設定の初回起動で設定モーダルが自動表示される', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await expect(page.locator('.modal')).toBeVisible();
    await expect(page.locator('.modal input[type="password"]').first()).toBeVisible();
  });

  test('設定モーダルで OpenAI API キーを入力して保存できる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // 設定モーダルが表示されるまで待機
    await expect(page.locator('.modal')).toBeVisible();

    // API キーを入力
    const apiKeyInput = page.locator('.modal input[type="password"]').first();
    await apiKeyInput.fill('sk-test-1234567890');

    // 保存ボタンをクリック
    await page.locator('.modal-actions .btn-primary').click();

    // モーダルが閉じることを確認
    await expect(page.locator('.modal')).toBeHidden();
  });

  test('API キー設定後にチャット画面が表示される', async ({ page }) => {
    await injectConfig(page);
    await page.goto('/');
    await waitForAppReady(page);

    // 設定モーダルが表示されない
    await expect(page.locator('.modal')).toBeHidden();

    // チャット UI が表示される
    await expect(page.locator('.chat-view')).toBeVisible();
    await expect(page.locator('.input-bar textarea')).toBeVisible();
  });

  test('提案ボタンをクリックしてメッセージを送信できる', async ({ page }) => {
    await injectConfig(page);
    await mockOpenAIResponses(page, 'こんにちは！何かお手伝いできることはありますか？');
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    // 提案ボタンが表示されることを確認
    const suggestions = page.locator('.chat-suggestions button');
    await expect(suggestions.first()).toBeVisible();

    // 提案ボタンをクリック
    await suggestions.first().click();

    // ユーザーメッセージが表示される
    await expect(page.locator('.message-user').first()).toBeVisible({ timeout: 10000 });

    // アシスタントの応答を待つ
    await expect(page.locator('.message-assistant')).toContainText('こんにちは', { timeout: 10000 });
  });

  test('テキスト入力からメッセージを送信し、アシスタントの応答が表示される', async ({ page }) => {
    await injectConfig(page);
    await mockOpenAIResponses(page, 'テスト応答です。');
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    // メッセージを送信
    await sendChatMessage(page, 'テストメッセージ');

    // ユーザーメッセージが表示される
    await expect(page.locator('.message-user')).toContainText('テストメッセージ', { timeout: 10000 });

    // アシスタントの応答が表示される
    await expect(page.locator('.message-assistant')).toContainText('テスト応答です。', { timeout: 10000 });
  });

  test('Shift+Enter で改行が入力される（送信されない）', async ({ page }) => {
    await injectConfig(page);
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    const textarea = page.locator('.input-bar textarea');
    await textarea.fill('1行目');
    await textarea.press('Shift+Enter');
    await textarea.type('2行目');

    // テキストが改行を含んでいることを確認
    const value = await textarea.inputValue();
    expect(value).toContain('1行目');
    expect(value).toContain('2行目');

    // メッセージが送信されていない
    await expect(page.locator('.message-user')).toHaveCount(0);
  });
});
