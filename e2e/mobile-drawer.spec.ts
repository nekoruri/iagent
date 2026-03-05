import { test, expect } from '@playwright/test';
import { mockOpenAIResponses } from './fixtures/api-mocks';
import { injectConfig, waitForAppReady, ensureConversation } from './fixtures/test-helpers';

async function swipeSidebar(
  page: import('@playwright/test').Page,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  await page.evaluate(({ sx, sy, ex, ey }) => {
    const root = document.querySelector('.app-container');
    if (!root || typeof Touch === 'undefined' || typeof TouchEvent === 'undefined') return;

    const createTouch = (x: number, y: number) =>
      new Touch({
        identifier: 1,
        target: root,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
        screenX: x,
        screenY: y,
      });

    const startTouch = createTouch(sx, sy);
    const moveTouch = createTouch(ex, ey);

    root.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [startTouch],
      targetTouches: [startTouch],
      changedTouches: [startTouch],
    }));
    root.dispatchEvent(new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
      touches: [moveTouch],
      targetTouches: [moveTouch],
      changedTouches: [moveTouch],
    }));
    root.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: [moveTouch],
    }));
  }, { sx: startX, sy: startY, ex: endX, ey: endY });
}

test.describe('モバイルビューポートでのドロワー動作', () => {
  test.beforeEach(async ({ page }) => {
    await injectConfig(page);
    await mockOpenAIResponses(page);
  });

  test('モバイルではサイドバーが初期非表示', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // サイドバーが open クラスを持たない
    await expect(page.locator('.sidebar.sidebar-open')).toHaveCount(0);
    // オーバーレイが表示されていない
    await expect(page.locator('.sidebar-overlay')).toHaveCount(0);
  });

  test('ハンバーガーメニュークリックでサイドバーがスライドイン', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // ハンバーガーメニューをクリック
    await page.locator('button.sidebar-toggle').click();

    // サイドバーが開く
    await expect(page.locator('.sidebar.sidebar-open')).toBeVisible();
    // オーバーレイが表示される
    await expect(page.locator('.sidebar-overlay')).toBeVisible();
  });

  test('左端スワイプでサイドバーが開く', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await swipeSidebar(page, 8, 260, 140, 268);

    await expect(page.locator('.sidebar.sidebar-open')).toBeVisible();
    await expect(page.locator('.sidebar-overlay')).toBeVisible();
  });

  test('オーバーレイクリックでサイドバーが閉じる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // サイドバーを開く
    await page.locator('button.sidebar-toggle').click();
    await expect(page.locator('.sidebar.sidebar-open')).toBeVisible();

    // オーバーレイをクリック
    await page.locator('.sidebar-overlay').click();

    // サイドバーが閉じる
    await expect(page.locator('.sidebar.sidebar-open')).toHaveCount(0);
    await expect(page.locator('.sidebar-overlay')).toHaveCount(0);
  });

  test('開いているサイドバーを左スワイプで閉じる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await page.locator('button.sidebar-toggle').click();
    await expect(page.locator('.sidebar.sidebar-open')).toBeVisible();

    await swipeSidebar(page, 220, 260, 80, 268);

    await expect(page.locator('.sidebar.sidebar-open')).toHaveCount(0);
    await expect(page.locator('.sidebar-overlay')).toHaveCount(0);
  });

  test('会話を選択するとサイドバーが自動で閉じる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    // サイドバーを開く
    await page.locator('button.sidebar-toggle').click();
    await expect(page.locator('.sidebar.sidebar-open')).toBeVisible();

    // 会話をクリック
    const firstItem = page.locator('.sidebar-item').first();
    await firstItem.click();

    // サイドバーが閉じる
    await expect(page.locator('.sidebar.sidebar-open')).toHaveCount(0);
  });
});
