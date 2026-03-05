import { test, expect } from '@playwright/test';
import {
  injectConfig,
  waitForAppReady,
  openSettings,
  injectActionLogEntries,
} from './fixtures/test-helpers';

test.describe('設定モーダル Action log', () => {
  test('自動実行ログが空の場合は空状態を表示する', async ({ page }) => {
    await injectConfig(page, {
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        tasks: [],
        desktopNotification: false,
        focusMode: false,
      },
    });
    await page.goto('/');
    await waitForAppReady(page);
    await openSettings(page);

    await expect(page.getByRole('heading', { name: '自動実行ログ（Action Planning）' })).toBeVisible();
    await expect(page.getByText('ログはまだありません。')).toBeVisible();
  });

  test('自動実行ログを新しい順で表示する', async ({ page }) => {
    await injectConfig(page, {
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        tasks: [],
        desktopNotification: false,
        focusMode: false,
      },
    });
    await page.goto('/');
    await waitForAppReady(page);
    await injectActionLogEntries(page, [
      { type: 'toggle-task', reason: '古いログ', detail: 'old', timestamp: 1000 },
      { type: 'update-task-interval', reason: '中間ログ', detail: 'mid', timestamp: 2000 },
      { type: 'update-quiet-hours', reason: '最新ログ', detail: 'new', timestamp: 3000 },
    ]);
    await openSettings(page);

    await expect(page.getByText('最新ログ')).toBeVisible();
    await expect(page.locator('.hb-action-log-item').nth(0)).toContainText('最新ログ');
    await expect(page.locator('.hb-action-log-item').nth(1)).toContainText('中間ログ');
    await expect(page.locator('.hb-action-log-item').nth(2)).toContainText('古いログ');
    await expect(page.getByText('静寂時間')).toBeVisible();
    await expect(page.getByText('間隔変更')).toBeVisible();
    await expect(page.getByText('タスク切替')).toBeVisible();
  });

  test('再読み込みで新しい自動実行ログを反映する', async ({ page }) => {
    await injectConfig(page, {
      heartbeat: {
        enabled: true,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        tasks: [],
        desktopNotification: false,
        focusMode: false,
      },
    });
    await page.goto('/');
    await waitForAppReady(page);
    await injectActionLogEntries(page, [
      { type: 'toggle-task', reason: '最初のログ', detail: 'first', timestamp: 1000 },
    ]);
    await openSettings(page);

    await expect(page.getByText('最初のログ')).toBeVisible();

    await injectActionLogEntries(page, [
      { type: 'update-quiet-days', reason: '再取得ログ', detail: '火木を追加', timestamp: 4000 },
      { type: 'toggle-task', reason: '最初のログ', detail: 'first', timestamp: 1000 },
    ]);

    await page.getByRole('button', { name: '再読み込み' }).click();

    await expect(page.locator('.hb-action-log-item').nth(0)).toContainText('再取得ログ');
    await expect(page.getByText('静寂曜日')).toBeVisible();
  });
});
