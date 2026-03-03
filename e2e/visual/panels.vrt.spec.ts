import { test, expect } from '@playwright/test';
import { injectConfig } from '../fixtures/test-helpers';
import { setTheme, disableAnimations, freezeTime, seedFeedItems } from '../fixtures/visual-helpers';

test.describe('FeedPanel + MemoryPanel VRT', () => {
  test('FeedPanel 空', async ({ page }) => {
    await injectConfig(page);
    await freezeTime(page);
    await page.goto('/');
    await page.waitForSelector('.app-container', { state: 'visible' });
    await disableAnimations(page);

    // フィードパネルを開く
    await page.locator('.btn-icon[title="フィード記事"]').click();
    await page.waitForSelector('.feed-panel-container', { state: 'visible' });

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page.locator('.feed-panel-container')).toHaveScreenshot(`feed-empty-${theme}.png`);
    }
  });

  test('FeedPanel 記事あり', async ({ page }) => {
    const ts = 1709449200000;
    // addInitScript ベースなので goto の前に呼ぶ
    await seedFeedItems(
      page,
      [
        { id: 'item-1', feedId: 'feed-1', title: 'AIの最新動向について', publishedAt: ts - 3600000 },
        { id: 'item-2', feedId: 'feed-1', title: 'React 20 がリリースされました', publishedAt: ts - 7200000 },
        { id: 'item-3', feedId: 'feed-2', title: 'TypeScript 6.0 の新機能', publishedAt: ts - 10800000 },
      ],
      [
        { id: 'feed-1', title: 'テック速報' },
        { id: 'feed-2', title: 'プログラミング最前線' },
      ],
    );
    await injectConfig(page);
    await freezeTime(page);
    await page.goto('/');
    await page.waitForSelector('.app-container', { state: 'visible' });
    await disableAnimations(page);

    await page.locator('.btn-icon[title="フィード記事"]').click();
    await page.waitForSelector('.feed-panel-container', { state: 'visible' });

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page.locator('.feed-panel-container')).toHaveScreenshot(`feed-items-${theme}.png`);
    }
  });

  test('MemoryPanel 空', async ({ page }) => {
    await injectConfig(page);
    await freezeTime(page);
    await page.goto('/');
    await page.waitForSelector('.app-container', { state: 'visible' });
    await disableAnimations(page);

    // メモリパネルを開く
    await page.locator('.btn-icon[title="記憶管理"]').click();
    await page.waitForSelector('.memory-panel-container', { state: 'visible' });

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page.locator('.memory-panel-container')).toHaveScreenshot(`memory-empty-${theme}.png`);
    }
  });

  test('MemoryPanel 記憶あり', async ({ page }) => {
    await injectConfig(page);
    await freezeTime(page);
    await page.goto('/');
    await page.waitForSelector('.app-container', { state: 'visible' });

    // アプリが IDB を開いた後にデータを直接注入
    const ts = 1709449200000;
    await page.evaluate((data) => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('iagent-db');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('memories', 'readwrite');
          const store = tx.objectStore('memories');
          for (const mem of data) {
            store.put(mem);
          }
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        request.onerror = () => reject(request.error);
      });
    }, [
      { id: 'mem-1', content: 'ユーザーはTypeScriptを好む', category: 'preference', importance: 4, tags: [], createdAt: ts - 86400000, updatedAt: ts - 3600000, accessCount: 0 },
      { id: 'mem-2', content: '毎朝9時にニュースチェックの習慣がある', category: 'routine', importance: 3, tags: [], createdAt: ts - 172800000, updatedAt: ts - 7200000, accessCount: 0 },
      { id: 'mem-3', content: '先週の会議でプロジェクトXの進捗を報告した', category: 'fact', importance: 3, tags: [], createdAt: ts - 259200000, updatedAt: ts - 86400000, accessCount: 0 },
    ]);

    // リロードしてデータを反映
    await page.reload();
    await page.waitForSelector('.app-container', { state: 'visible' });
    await disableAnimations(page);

    await page.locator('.btn-icon[title="記憶管理"]').click();
    await page.waitForSelector('.memory-dropdown', { state: 'visible' });

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page.locator('.memory-panel-container')).toHaveScreenshot(`memory-items-${theme}.png`);
    }
  });
});
