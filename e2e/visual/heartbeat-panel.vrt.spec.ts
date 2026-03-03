import { test, expect } from '@playwright/test';
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

/**
 * アプリ起動後に IndexedDB へ Heartbeat 結果をシードする。
 * addInitScript ではなく page.evaluate を使い、アプリが作成済みの
 * DB スキーマ（バージョン 10）に対して安全に書き込む。
 * 呼び出し後に page.reload() が必要。
 */
async function seedHeartbeatResults(
  page: import('@playwright/test').Page,
  results: unknown[],
  ts: number,
): Promise<void> {
  await page.evaluate(({ results: r, ts: t }) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('iagent-db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        // heartbeat ストアが無い場合はバージョンアップして作成
        if (!db.objectStoreNames.contains('heartbeat')) {
          db.close();
          const version = db.version + 1;
          const req2 = indexedDB.open('iagent-db', version);
          req2.onupgradeneeded = () => {
            if (!req2.result.objectStoreNames.contains('heartbeat')) {
              req2.result.createObjectStore('heartbeat', { keyPath: 'key' });
            }
          };
          req2.onsuccess = () => {
            const db2 = req2.result;
            const tx = db2.transaction('heartbeat', 'readwrite');
            tx.objectStore('heartbeat').put({ key: 'state', lastChecked: t, recentResults: r });
            tx.oncomplete = () => { db2.close(); resolve(); };
            tx.onerror = () => { db2.close(); reject(tx.error); };
          };
          req2.onerror = () => reject(req2.error);
          return;
        }
        const tx = db.transaction('heartbeat', 'readwrite');
        tx.objectStore('heartbeat').put({ key: 'state', lastChecked: t, recentResults: r });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, { results, ts });
}

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
    await seedHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: ts - 60000, hasChanges: true, summary: 'テスト結果1: 天気が変わりました', pinned: true },
      { taskId: 'test-task', timestamp: ts - 30000, hasChanges: false, summary: '変化なし' },
      { taskId: 'test-task', timestamp: ts - 10000, hasChanges: true, summary: 'テスト結果2: 新しいニュース' },
    ], ts);
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
    await seedHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: DEFAULT_FROZEN_TS, hasChanges: true, summary: '新着結果' },
    ], DEFAULT_FROZEN_TS);
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
