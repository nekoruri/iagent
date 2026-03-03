import { test, expect } from '@playwright/test';
import { setupForVRT, setTheme } from '../fixtures/visual-helpers';

test.describe('セットアップウィザード VRT', () => {
  test.beforeEach(async ({ page }) => {
    // skipConfig: true でウィザードを表示させる
    await setupForVRT(page, { skipConfig: true });
    await page.waitForSelector('.wizard-modal', { state: 'visible' });
  });

  test('Step 0 Welcome', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`wizard-welcome-${theme}.png`);
    }
  });

  test('Step 1 API Key 入力', async ({ page }) => {
    await page.click('text=はじめる');
    await page.waitForSelector('input[placeholder="sk-..."]', { state: 'visible' });

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`wizard-apikey-${theme}.png`);
    }
  });

  test('Step 2 Persona 設定', async ({ page }) => {
    await page.click('text=はじめる');
    await page.fill('input[placeholder="sk-..."]', 'test-api-key-dummy');
    await page.click('text=次へ');

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`wizard-persona-${theme}.png`);
    }
  });

  test('Step 3 完了', async ({ page }) => {
    await page.click('text=はじめる');
    await page.fill('input[placeholder="sk-..."]', 'test-api-key-dummy');
    await page.click('text=次へ');
    await page.click('text=スキップ');

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`wizard-complete-${theme}.png`);
    }
  });
});
