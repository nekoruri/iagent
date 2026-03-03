import { test, expect } from '@playwright/test';
import { openSettings } from '../fixtures/test-helpers';
import { setupForVRT, setTheme, disableAnimations } from '../fixtures/visual-helpers';

test.describe('設定モーダル VRT', () => {
  test.beforeEach(async ({ page }) => {
    await setupForVRT(page);
    await openSettings(page);
    await disableAnimations(page);
  });

  test('基本設定セクション', async ({ page }) => {
    const section = page.locator('details.settings-section').first();
    await expect(section).toBeVisible();

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(section).toHaveScreenshot(`settings-basic-${theme}.png`);
    }
  });

  test('エージェント設定セクション', async ({ page }) => {
    const section = page.locator('details.settings-section').nth(1);
    // セクションを開く
    await section.locator('summary').click();
    await page.waitForTimeout(100);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(section).toHaveScreenshot(`settings-agent-${theme}.png`);
    }
  });

  test('MCP Servers セクション', async ({ page }) => {
    const section = page.locator('details.settings-section').nth(2);
    await section.locator('summary').click();
    await page.waitForTimeout(100);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(section).toHaveScreenshot(`settings-mcp-${theme}.png`);
    }
  });

  test('Heartbeat セクション', async ({ page }) => {
    const section = page.locator('details.settings-section').nth(3);
    await section.locator('summary').click();
    await page.waitForTimeout(100);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(section).toHaveScreenshot(`settings-heartbeat-${theme}.png`);
    }
  });

  test('CORS プロキシセクション', async ({ page }) => {
    const section = page.locator('details.settings-section').nth(4);
    await section.locator('summary').click();
    await page.waitForTimeout(100);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(section).toHaveScreenshot(`settings-proxy-${theme}.png`);
    }
  });

  test('オブザーバビリティセクション', async ({ page }) => {
    const section = page.locator('details.settings-section').nth(5);
    await section.locator('summary').click();
    await page.waitForTimeout(100);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(section).toHaveScreenshot(`settings-otel-${theme}.png`);
    }
  });
});
