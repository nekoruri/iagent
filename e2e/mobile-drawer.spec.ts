import { test, expect } from '@playwright/test';
import { mockOpenAIResponses } from './fixtures/api-mocks';
import { injectConfig, waitForAppReady, ensureConversation } from './fixtures/test-helpers';

test.describe('モバイルビューポートでのドロワー動作', () => {
  test.beforeEach(async ({ page }) => {
    await injectConfig(page);
    await mockOpenAIResponses(page);
  });

  test('モバイルではサイドバーが初期非表示', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // サイドバーが open クラスを持たない
    await expect(page.locator('.sidebar.sidebar-open')).toHaveCount(0);
    // オーバーレイが表示されていない
    await expect(page.locator('.sidebar-overlay')).toHaveCount(0);
  });

  test('ハンバーガーメニュークリックでサイドバーがスライドイン', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // ハンバーガーメニューをクリック
    await page.locator('button.sidebar-toggle').click();

    // サイドバーが開く
    await expect(page.locator('.sidebar.sidebar-open')).toBeVisible();
    // オーバーレイが表示される
    await expect(page.locator('.sidebar-overlay')).toBeVisible();
  });

  test('オーバーレイクリックでサイドバーが閉じる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // サイドバーを開く
    await page.locator('button.sidebar-toggle').click();
    await expect(page.locator('.sidebar.sidebar-open')).toBeVisible();

    // オーバーレイをクリック
    await page.locator('.sidebar-overlay').click();

    // サイドバーが閉じる
    await expect(page.locator('.sidebar.sidebar-open')).toHaveCount(0);
    await expect(page.locator('.sidebar-overlay')).toHaveCount(0);
  });

  test('会話を選択するとサイドバーが自動で閉じる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    // サイドバーを開く
    await page.locator('button.sidebar-toggle').click();
    await expect(page.locator('.sidebar.sidebar-open')).toBeVisible();

    // 会話をクリック
    const firstItem = page.locator('.sidebar-item').first();
    await firstItem.click();

    // サイドバーが閉じる
    await expect(page.locator('.sidebar.sidebar-open')).toHaveCount(0);
  });
});
