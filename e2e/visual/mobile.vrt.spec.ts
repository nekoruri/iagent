import { test, expect } from '@playwright/test';
import { ensureConversation, openSettings } from '../fixtures/test-helpers';
import { setupForVRT, setTheme, disableAnimations } from '../fixtures/visual-helpers';

test.describe('モバイルレイアウト VRT', () => {
  test('モバイルチャット画面', async ({ page }) => {
    await setupForVRT(page);
    await ensureConversation(page);
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`mobile-chat-${theme}.png`);
    }
  });

  test('サイドバー展開（ドロワー）', async ({ page }) => {
    await setupForVRT(page);
    await ensureConversation(page);

    // ハンバーガーメニューでサイドバーを開く
    await page.locator('button.sidebar-toggle').click();
    await page.waitForSelector('.sidebar.sidebar-open', { state: 'visible' });
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`mobile-drawer-${theme}.png`);
    }
  });

  test('設定モーダル', async ({ page }) => {
    await setupForVRT(page);
    await openSettings(page);
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`mobile-settings-${theme}.png`);
    }
  });

  test('セットアップウィザード', async ({ page }) => {
    await setupForVRT(page, { skipConfig: true });
    await page.waitForSelector('.wizard-modal', { state: 'visible' });
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`mobile-wizard-${theme}.png`);
    }
  });
});
