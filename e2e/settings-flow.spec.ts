import { test, expect } from '@playwright/test';
import { mockOpenAIResponses } from './fixtures/api-mocks';
import {
  injectConfig,
  waitForAppReady,
  ensureConversation,
  sendChatMessage,
  openSettings,
  saveAndCloseSettings,
} from './fixtures/test-helpers';

test.describe('初回起動 → API キー設定 → チャット送信フロー', () => {
  test('API キー未設定の初回起動でセットアップウィザードが表示される', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await expect(page.locator('.wizard-modal')).toBeVisible();
    await expect(page.locator('text=iAgent へようこそ')).toBeVisible();
  });

  test('セットアップウィザードで API キーを設定して完了できる', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Welcome → はじめる
    await expect(page.locator('.wizard-modal')).toBeVisible();
    await page.click('text=はじめる');

    // API Key 入力
    await page.fill('input[placeholder="sk-..."]', 'test-api-key-dummy');
    await page.click('text=次へ');

    // Persona → スキップ
    await page.click('text=スキップ');

    // Complete → 使い始める
    await page.click('text=使い始める');

    // ウィザードが閉じることを確認
    await expect(page.locator('.wizard-modal')).toBeHidden();
  });

  test('推奨プリセット適用時に suggestionFrequency と Heartbeat 推奨タスクが保存される', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await page.click('text=はじめる');
    await page.fill('input[placeholder="sk-..."]', 'test-api-key-dummy');
    await page.click('text=次へ');
    await page.click('text=推奨プリセットを適用');
    await page.click('text=次へ');
    await page.click('text=使い始める');
    await expect(page.locator('.wizard-modal')).toBeHidden();

    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('iagent-config');
      return raw ? JSON.parse(raw) : null;
    }) as {
      suggestionFrequency?: string;
      heartbeat?: { tasks?: Array<{ id: string; enabled: boolean }> };
    } | null;

    expect(saved).not.toBeNull();
    expect(saved?.suggestionFrequency).toBe('high');

    const taskMap = new Map((saved?.heartbeat?.tasks ?? []).map((task) => [task.id, task.enabled]));
    expect(taskMap.get('calendar-check')).toBe(true);
    expect(taskMap.get('feed-check')).toBe(true);
    expect(taskMap.get('web-monitor-check')).toBe(true);
    expect(taskMap.get('briefing-morning')).toBe(true);
    expect(taskMap.get('weekly-summary')).toBe(false);
  });

  test('API キー設定後にチャット画面が表示される', async ({ page }) => {
    await injectConfig(page);
    await page.goto('/');
    await waitForAppReady(page);

    // ウィザードが表示されない
    await expect(page.locator('.wizard-modal')).toBeHidden();

    // チャット UI が表示される
    await expect(page.locator('.chat-view')).toBeVisible();
    await expect(page.locator('.input-bar textarea')).toBeVisible();
  });

  test('設定モーダルでペルソナプリセットをインポートして保存できる', async ({ page }) => {
    await injectConfig(page, {
      suggestionFrequency: 'high',
      persona: {
        name: 'Before Import',
        personality: '初期',
        tone: '初期',
        customInstructions: '初期',
      },
      heartbeat: {
        enabled: false,
        intervalMinutes: 30,
        quietHoursStart: 0,
        quietHoursEnd: 6,
        quietDays: [],
        maxNotificationsPerDay: 0,
        desktopNotification: false,
        focusMode: false,
        costControl: {
          enabled: true,
          dailyTokenBudget: 0,
          pressureThreshold: 0.8,
          deferNonCriticalTasks: true,
        },
        tasks: [
          { id: 'calendar-check', name: 'カレンダー', description: '', enabled: false, type: 'builtin' },
          { id: 'feed-check', name: 'フィード', description: '', enabled: true, type: 'builtin' },
          { id: 'custom-task', name: 'カスタム', description: '', enabled: true, type: 'custom' },
        ],
      },
    });
    await page.goto('/');
    await waitForAppReady(page);

    await openSettings(page);

    const presetJson = JSON.stringify({
      format: 'iagent-persona-preset',
      version: 1,
      persona: {
        name: 'Imported Agent',
        personality: '分析重視',
        tone: 'フォーマル',
        customInstructions: '根拠を示す',
      },
      suggestionFrequency: 'medium',
      recommendedTaskIds: ['calendar-check'],
    });
    await page
      .getByTestId('persona-preset-import-input')
      .setInputFiles({
        name: 'persona-preset.json',
        mimeType: 'application/json',
        buffer: Buffer.from(presetJson, 'utf-8'),
      });

    await expect(page.getByText('ペルソナプリセットを適用しました（推奨タスク 1 件）。')).toBeVisible();

    await saveAndCloseSettings(page);

    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('iagent-config');
      return raw ? JSON.parse(raw) : null;
    }) as {
      suggestionFrequency?: string;
      persona?: {
        name?: string;
        personality?: string;
        tone?: string;
        customInstructions?: string;
      };
      heartbeat?: { tasks?: Array<{ id: string; enabled: boolean }> };
    } | null;

    expect(saved).not.toBeNull();
    expect(saved?.suggestionFrequency).toBe('medium');
    expect(saved?.persona).toEqual({
      name: 'Imported Agent',
      personality: '分析重視',
      tone: 'フォーマル',
      customInstructions: '根拠を示す',
    });
    const taskMap = new Map((saved?.heartbeat?.tasks ?? []).map((task) => [task.id, task.enabled]));
    expect(taskMap.get('calendar-check')).toBe(true);
    expect(taskMap.get('feed-check')).toBe(false);
    expect(taskMap.get('custom-task')).toBe(true);
  });

  test('提案ボタンをクリックしてメッセージを送信できる', async ({ page }) => {
    await injectConfig(page);
    await mockOpenAIResponses(page, 'こんにちは！何かお手伝いできることはありますか？');
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    // 提案ボタンが表示されることを確認
    const suggestions = page.locator('.chat-suggestions button');
    await expect(suggestions.first()).toBeVisible();

    // 提案ボタンをクリック
    await suggestions.first().click();

    // ユーザーメッセージが表示される
    await expect(page.locator('.message-user').first()).toBeVisible({ timeout: 10000 });

    // アシスタントの応答を待つ
    await expect(page.locator('.message-assistant')).toContainText('こんにちは', { timeout: 10000 });
  });

  test('テキスト入力からメッセージを送信し、アシスタントの応答が表示される', async ({ page }) => {
    await injectConfig(page);
    await mockOpenAIResponses(page, 'テスト応答です。');
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    // メッセージを送信
    await sendChatMessage(page, 'テストメッセージ');

    // ユーザーメッセージが表示される
    await expect(page.locator('.message-user')).toContainText('テストメッセージ', { timeout: 10000 });

    // アシスタントの応答が表示される
    await expect(page.locator('.message-assistant')).toContainText('テスト応答です。', { timeout: 10000 });
  });

  test('Shift+Enter で改行が入力される（送信されない）', async ({ page }) => {
    await injectConfig(page);
    await page.goto('/');
    await waitForAppReady(page);
    await ensureConversation(page);

    const textarea = page.locator('.input-bar textarea');
    await textarea.fill('1行目');
    await textarea.press('Shift+Enter');
    await textarea.type('2行目');

    // テキストが改行を含んでいることを確認
    const value = await textarea.inputValue();
    expect(value).toContain('1行目');
    expect(value).toContain('2行目');

    // メッセージが送信されていない
    await expect(page.locator('.message-user')).toHaveCount(0);
  });
});
