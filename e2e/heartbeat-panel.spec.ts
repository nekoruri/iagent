import { test, expect } from '@playwright/test';
import { injectConfig, waitForAppReady } from './fixtures/test-helpers';

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

/**
 * ページロード前に IndexedDB へ Heartbeat 結果をシードする。
 * page.addInitScript を使い、ページスクリプトより先に IDB を書き込む。
 * DB をバージョン 1 で作成し、アプリ側のバージョン 11 へのアップグレードで
 * 他ストアが追加されても heartbeat データは保持される。
 */
function seedHeartbeatResults(page: import('@playwright/test').Page, results: unknown[]) {
  return page.addInitScript((data) => {
    const request = indexedDB.open('iagent-db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('heartbeat')) {
        db.createObjectStore('heartbeat', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('heartbeat', 'readwrite');
      tx.objectStore('heartbeat').put({
        key: 'state',
        lastChecked: Date.now(),
        recentResults: data,
      });
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    };
  }, results);
}

test.describe('Heartbeat パネル操作', () => {
  test('ベルアイコンクリックでパネルが開閉する', async ({ page }) => {
    await injectConfig(page, heartbeatConfig);
    await page.goto('/');
    await waitForAppReady(page);

    const bell = page.locator('.heartbeat-bell');
    await expect(bell).toBeVisible();

    await bell.click();
    await expect(page.locator('.heartbeat-dropdown')).toBeVisible();

    await bell.click();
    await expect(page.locator('.heartbeat-dropdown')).toBeHidden();
  });

  test('結果がない場合は空メッセージが表示される', async ({ page }) => {
    await injectConfig(page, heartbeatConfig);
    await page.goto('/');
    await waitForAppReady(page);

    await page.locator('.heartbeat-bell').click();
    await expect(page.locator('.heartbeat-dropdown-empty')).toContainText('まだ結果がありません');
  });

  test('結果一覧が表示される', async ({ page }) => {
    const now = Date.now();
    // addInitScript でページロード前に IDB をシード
    await seedHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: now - 60000, hasChanges: true, summary: 'テスト結果1' },
      { taskId: 'test-task', timestamp: now - 30000, hasChanges: false, summary: '変化なし' },
    ]);
    await injectConfig(page, heartbeatConfig);
    await page.goto('/');
    await waitForAppReady(page);

    await page.locator('.heartbeat-bell').click();
    await expect(page.locator('.heartbeat-dropdown')).toBeVisible();

    const items = page.locator('.heartbeat-result-item');
    await expect(items).toHaveCount(2, { timeout: 5000 });
    await expect(items.first()).toContainText('テスト結果1');
  });

  test('未読バッジが表示される', async ({ page }) => {
    await seedHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: Date.now(), hasChanges: true, summary: '新着結果' },
    ]);
    await injectConfig(page, heartbeatConfig);
    await page.goto('/');
    await waitForAppReady(page);

    const badge = page.locator('.heartbeat-badge');
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toContainText('1');
  });

  test('パネルを開くと未読バッジが消える', async ({ page }) => {
    await seedHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: Date.now(), hasChanges: true, summary: '新着' },
    ]);
    await injectConfig(page, heartbeatConfig);
    await page.goto('/');
    await waitForAppReady(page);

    await expect(page.locator('.heartbeat-badge')).toBeVisible({ timeout: 5000 });

    // パネルを開く → 既読 → バッジが消える
    await page.locator('.heartbeat-bell').click();
    await expect(page.locator('.heartbeat-dropdown')).toBeVisible();

    await page.locator('.heartbeat-bell').click();
    await expect(page.locator('.heartbeat-badge')).toBeHidden({ timeout: 5000 });
  });

  test('ピン留め操作で状態表示が更新される', async ({ page }) => {
    await seedHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: Date.now(), hasChanges: true, summary: 'ピン対象' },
    ]);
    await injectConfig(page, heartbeatConfig);
    await page.goto('/');
    await waitForAppReady(page);

    await page.locator('.heartbeat-bell').click();
    const item = page.locator('.heartbeat-result-item').first();
    const pinButton = item.locator('.btn-pin');

    await expect(pinButton).toHaveAttribute('title', 'ピン留め');
    await pinButton.click();

    await expect(pinButton).toHaveAttribute('title', 'ピン留め解除');
    await expect(item).toHaveClass(/heartbeat-result-pinned/);
    await expect(item.locator('.heartbeat-result-badge-pinned')).toContainText('ピン留め');
  });

  test('フィードバック操作で確認済み表示と非表示が切り替わる', async ({ page }) => {
    const baseTimestamp = Date.now();
    await seedHeartbeatResults(page, [
      { taskId: 'accept-task', timestamp: baseTimestamp, hasChanges: true, summary: '役に立つ結果' },
      { taskId: 'dismiss-task', timestamp: baseTimestamp - 1000, hasChanges: true, summary: '不要な結果' },
    ]);
    await injectConfig(page, heartbeatConfig);
    await page.goto('/');
    await waitForAppReady(page);

    await page.locator('.heartbeat-bell').click();

    const acceptItem = page.locator('.heartbeat-result-item').filter({ hasText: '役に立つ結果' });
    await acceptItem.locator('[title="役に立った"]').click();
    await expect(acceptItem.locator('.feedback-label-accepted')).toContainText('確認済み');

    const dismissItem = page.locator('.heartbeat-result-item').filter({ hasText: '不要な結果' });
    await dismissItem.locator('[title="不要"]').click();
    await expect(page.locator('.heartbeat-result-item').filter({ hasText: '不要な結果' })).toHaveCount(0);
  });
});
