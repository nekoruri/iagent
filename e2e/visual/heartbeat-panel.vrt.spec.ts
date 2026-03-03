import { test, expect } from '@playwright/test';
import { injectHeartbeatResults } from '../fixtures/test-helpers';
import { setupForVRT, setTheme, disableAnimations, DEFAULT_FROZEN_TS } from '../fixtures/visual-helpers';

const heartbeatConfig = {
  heartbeat: {
    enabled: true,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    tasks: [{ id: 'test-task', label: 'テスト', prompt: 'テスト', schedule: { type: 'global' } }],
    desktopNotification: false,
  },
};

test.describe('Heartbeat パネル VRT', () => {
  test('空パネル', async ({ page }) => {
    await setupForVRT(page, { configOverrides: heartbeatConfig });

    await page.locator('.heartbeat-bell').click();
    await expect(page.locator('.heartbeat-dropdown')).toBeVisible();
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page.locator('.heartbeat-dropdown')).toHaveScreenshot(`heartbeat-empty-${theme}.png`);
    }
  });

  test('結果一覧（ピン留め + フィードバックボタン）', async ({ page }) => {
    const ts = DEFAULT_FROZEN_TS;
    await setupForVRT(page, { configOverrides: heartbeatConfig });

    // アプリ起動後にデータをシードしてリロード
    await injectHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: ts - 60000, hasChanges: true, summary: 'テスト結果1: 天気が変わりました', pinned: true },
      { taskId: 'test-task', timestamp: ts - 30000, hasChanges: false, summary: '変化なし' },
      { taskId: 'test-task', timestamp: ts - 10000, hasChanges: true, summary: 'テスト結果2: 新しいニュース' },
    ], { lastChecked: ts });
    await page.reload();
    await page.waitForSelector('.app-container', { state: 'visible' });

    await page.locator('.heartbeat-bell').click();
    await expect(page.locator('.heartbeat-dropdown')).toBeVisible();
    await expect(page.locator('.heartbeat-result-item')).toHaveCount(3, { timeout: 5000 });
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page.locator('.heartbeat-dropdown')).toHaveScreenshot(`heartbeat-results-${theme}.png`);
    }
  });

  test('未読バッジ表示', async ({ page }) => {
    await setupForVRT(page, { configOverrides: heartbeatConfig });

    // アプリ起動後にデータをシードしてリロード
    await injectHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: DEFAULT_FROZEN_TS, hasChanges: true, summary: '新着結果' },
    ], { lastChecked: DEFAULT_FROZEN_TS });
    await page.reload();
    await page.waitForSelector('.app-container', { state: 'visible' });

    await expect(page.locator('.heartbeat-badge')).toBeVisible({ timeout: 5000 });
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      // ベルアイコン周辺をキャプチャ
      await expect(page.locator('.heartbeat-bell')).toHaveScreenshot(`heartbeat-badge-${theme}.png`);
    }
  });
});
