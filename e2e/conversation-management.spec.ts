import { test, expect } from '@playwright/test';
import { mockOpenAIResponses } from './fixtures/api-mocks';
import { injectConfig, waitForAppReady, ensureConversation, sendChatMessage } from './fixtures/test-helpers';

test.describe('会話管理（作成・切替・削除）', () => {
  test.beforeEach(async ({ page }) => {
    await injectConfig(page);
    await mockOpenAIResponses(page);
  });

  test('新しい会話を作成できる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    const items = page.locator('.sidebar-item');
    const initialCount = await items.count();

    // 新しい会話を作成（ヘッダーの + ボタン）
    await page.locator('.header-actions .btn-icon[title="新しい会話"]').click();

    // 会話が1つ増える
    await expect(items).toHaveCount(initialCount + 1);
  });

  test('会話を切り替えるとメッセージが変わる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    // 最初の会話にメッセージを送信
    await sendChatMessage(page, '会話1のメッセージ');
    await expect(page.locator('.message-user')).toContainText('会話1のメッセージ', { timeout: 10000 });

    // 新しい会話を作成
    await page.locator('.header-actions .btn-icon[title="新しい会話"]').click();

    // 新しい会話ではメッセージが表示されない（空状態表示を待つ）
    await expect(page.locator('.chat-empty')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.message-user')).toHaveCount(0);

    // 元の会話に切り替え — サイドバーの2番目（古い方）をクリック
    const sidebarItems = page.locator('.sidebar-item');
    await sidebarItems.last().click();

    // 元のメッセージが復元される
    await expect(page.locator('.message-user')).toContainText('会話1のメッセージ', { timeout: 10000 });
  });

  test('会話を削除できる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    // 新しい会話を作成して2つにする
    await page.locator('.header-actions .btn-icon[title="新しい会話"]').click();
    await page.waitForTimeout(500);
    const items = page.locator('.sidebar-item');
    const countBefore = await items.count();
    expect(countBefore).toBeGreaterThanOrEqual(2);

    // 最初の会話の削除ボタンをクリック
    const deleteBtn = items.first().locator('.sidebar-item-delete');
    // hover して削除ボタンを表示
    await items.first().hover();
    await deleteBtn.click();

    // 会話が1つ減る
    await expect(items).toHaveCount(countBefore - 1);
  });
});
