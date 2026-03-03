import { test, expect } from '@playwright/test';
import { mockOpenAIResponses } from '../fixtures/api-mocks';
import { ensureConversation, sendChatMessage } from '../fixtures/test-helpers';
import { setupForVRT, setTheme, disableAnimations } from '../fixtures/visual-helpers';

test.describe('サイドバー VRT', () => {
  test('会話3件表示（1件アクティブ）', async ({ page }) => {
    await mockOpenAIResponses(page, '応答');
    await setupForVRT(page);

    // 会話を3件作成
    for (let i = 0; i < 3; i++) {
      await page.locator('.header-actions .btn-icon[title="新しい会話"]').click();
      await page.waitForTimeout(200);
      await sendChatMessage(page, `テスト会話${i + 1}`);
      await page.waitForSelector('.message-assistant', { state: 'visible', timeout: 10000 });
      await page.waitForFunction(
        () => !document.querySelector('.message-assistant.streaming'),
        { timeout: 10000 },
      );
    }

    await disableAnimations(page);
    const sidebar = page.locator('.sidebar');

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(sidebar).toHaveScreenshot(`sidebar-conversations-${theme}.png`);
    }
  });

  test('会話なし', async ({ page }) => {
    await setupForVRT(page);
    await disableAnimations(page);
    const sidebar = page.locator('.sidebar');

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(sidebar).toHaveScreenshot(`sidebar-empty-${theme}.png`);
    }
  });
});
