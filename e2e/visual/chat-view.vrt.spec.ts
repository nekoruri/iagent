import { test, expect } from '@playwright/test';
import { mockOpenAIResponses } from '../fixtures/api-mocks';
import { ensureConversation, sendChatMessage } from '../fixtures/test-helpers';
import { setupForVRT, setTheme, disableAnimations } from '../fixtures/visual-helpers';

test.describe('チャット画面 VRT', () => {
  test('空の会話画面', async ({ page }) => {
    await setupForVRT(page);
    await ensureConversation(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`chat-empty-${theme}.png`);
    }
  });

  test('ユーザー + アシスタントメッセージ表示', async ({ page }) => {
    await mockOpenAIResponses(page, 'こんにちは！お手伝いできることはありますか？');
    await setupForVRT(page);
    await ensureConversation(page);

    await sendChatMessage(page, 'テストメッセージです');
    await page.waitForSelector('.message-assistant', { state: 'visible', timeout: 10000 });
    // ストリーミング完了を待つ
    await page.waitForFunction(
      () => !document.querySelector('.message-assistant.streaming'),
      { timeout: 10000 },
    );
    // アニメーションを再度無効化（動的追加された要素対策）
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`chat-messages-${theme}.png`);
    }
  });

  test('Markdown レンダリング', async ({ page }) => {
    const markdown = '## 見出し\n\n- リスト1\n- リスト2\n\n```js\nconsole.log("hello");\n```';
    await mockOpenAIResponses(page, markdown);
    await setupForVRT(page);
    await ensureConversation(page);

    await sendChatMessage(page, 'Markdownテスト');
    await page.waitForSelector('.message-assistant', { state: 'visible', timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector('.message-assistant.streaming'),
      { timeout: 10000 },
    );
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`chat-markdown-${theme}.png`);
    }
  });

  test('Heartbeat ソースメッセージ表示', async ({ page }) => {
    await mockOpenAIResponses(page, 'Heartbeat の結果です。');
    await setupForVRT(page, {
      configOverrides: {
        heartbeat: {
          enabled: true,
          intervalMinutes: 30,
          quietHoursStart: 0,
          quietHoursEnd: 6,
          tasks: [{ id: 'test-task', label: 'テスト', prompt: 'テスト', schedule: { type: 'global' } }],
          desktopNotification: false,
        },
      },
    });
    await ensureConversation(page);

    await sendChatMessage(page, '[heartbeat] テスト確認');
    await page.waitForSelector('.message-assistant', { state: 'visible', timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector('.message-assistant.streaming'),
      { timeout: 10000 },
    );
    await disableAnimations(page);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`chat-heartbeat-${theme}.png`);
    }
  });
});
