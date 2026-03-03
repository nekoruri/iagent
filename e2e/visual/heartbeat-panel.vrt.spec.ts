import { test, expect } from '@playwright/test';
import { setupForVRT, setTheme, disableAnimations } from '../fixtures/visual-helpers';

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
 */
import { DEFAULT_FROZEN_TS } from '../fixtures/visual-helpers';

function seedHeartbeatResults(page: import('@playwright/test').Page, results: unknown[]) {
  return page.addInitScript((data) => {
    function writeState(db: IDBDatabase) {
      const tx = db.transaction('heartbeat', 'readwrite');
      tx.objectStore('heartbeat').put({
        key: 'state',
        lastChecked: data.ts,
        recentResults: data.results,
      });
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    }

    const request = indexedDB.open('iagent-db');
    request.onerror = () => {
      console.error('IndexedDB: iagent-db を開けませんでした', request.error);
    };
    request.onsuccess = () => {
      const db = request.result;
      // heartbeat ストアが存在する場合はそのまま書き込み
      if (db.objectStoreNames.contains('heartbeat')) {
        writeState(db);
        return;
      }
      // ストアが無い場合は DB バージョンアップして作成
      db.close();
      const version = db.version + 1;
      const req2 = indexedDB.open('iagent-db', version);
      req2.onupgradeneeded = () => {
        if (!req2.result.objectStoreNames.contains('heartbeat')) {
          req2.result.createObjectStore('heartbeat', { keyPath: 'key' });
        }
      };
      req2.onsuccess = () => writeState(req2.result);
      req2.onerror = () => {
        console.error('IndexedDB: heartbeat ストア作成用のバージョンアップに失敗しました', req2.error);
      };
      req2.onblocked = () => {
        console.warn('IndexedDB: heartbeat ストア作成用のバージョンアップがブロックされました');
      };
    };
  }, { results, ts: DEFAULT_FROZEN_TS });
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
    await seedHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: ts - 60000, hasChanges: true, summary: 'テスト結果1: 天気が変わりました', pinned: true },
      { taskId: 'test-task', timestamp: ts - 30000, hasChanges: false, summary: '変化なし' },
      { taskId: 'test-task', timestamp: ts - 10000, hasChanges: true, summary: 'テスト結果2: 新しいニュース' },
    ]);
    await setupForVRT(page, { configOverrides: heartbeatConfig });

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
    await seedHeartbeatResults(page, [
      { taskId: 'test-task', timestamp: DEFAULT_FROZEN_TS, hasChanges: true, summary: '新着結果' },
    ]);
    await setupForVRT(page, { configOverrides: heartbeatConfig });

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
