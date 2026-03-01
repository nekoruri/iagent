import type { Page } from '@playwright/test';

/**
 * localStorage に設定を注入して API キー設定済み状態にする。
 */
export async function injectConfig(
  page: Page,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const config = {
    openaiApiKey: 'sk-test-1234567890',
    braveApiKey: '',
    openWeatherMapApiKey: '',
    mcpServers: [],
    heartbeat: {
      enabled: false,
      intervalMinutes: 30,
      quietHoursStart: 0,
      quietHoursEnd: 6,
      tasks: [],
      desktopNotification: false,
    },
    otel: {
      enabled: false,
      endpoint: '/api/otel',
      headers: {},
      batchSize: 10,
      flushIntervalMs: 30000,
    },
    ...overrides,
  };

  await page.addInitScript((serialized) => {
    localStorage.setItem('iagent-config', serialized);
  }, JSON.stringify(config));
}

/**
 * アプリケーションが表示完了するまで待機する。
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('.app-container', { state: 'visible' });
}

/**
 * アクティブな会話が存在することを保証する。
 * 会話がない場合は「+ 新しい会話」ボタンで作成する。
 * モバイルビューポートではサイドバーが非表示のため、DOM の attached 状態で確認する。
 */
export async function ensureConversation(page: Page): Promise<void> {
  // サイドバーに会話があるか確認（DOM 上に存在するか、非表示でもOK）
  const items = page.locator('.sidebar-item');
  const count = await items.count();
  if (count === 0) {
    // 会話がないので作成
    await page.locator('.header-actions .btn-icon[title="新しい会話"]').click();
    // DOM にアイテムが追加されるまで待機（モバイルでは非表示でも attached になる）
    await page.waitForSelector('.sidebar-item', { state: 'attached' });
  }
}

/**
 * チャットにメッセージを送信する。
 */
export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const textarea = page.locator('.input-bar textarea');
  await textarea.fill(text);
  await textarea.press('Enter');
}

/**
 * セットアップウィザードを完了する（初回起動時）。
 */
export async function completeSetupWizard(page: Page, apiKey = 'sk-test-1234567890'): Promise<void> {
  await page.waitForSelector('.wizard-modal', { state: 'visible' });
  await page.click('text=はじめる');
  await page.fill('input[placeholder="sk-..."]', apiKey);
  await page.click('text=次へ');
  await page.click('text=スキップ');
  await page.click('text=使い始める');
  await page.waitForSelector('.wizard-modal', { state: 'hidden' });
}

/**
 * 設定モーダルを開く。
 */
export async function openSettings(page: Page): Promise<void> {
  await page.locator('.header-actions .btn-icon[title="設定"]').click();
  await page.waitForSelector('.modal', { state: 'visible' });
}

/**
 * 設定モーダルを保存して閉じる。
 */
export async function saveAndCloseSettings(page: Page): Promise<void> {
  await page.locator('.modal-actions .btn-primary').click();
  await page.waitForSelector('.modal', { state: 'hidden' });
}

/**
 * ストリーミング応答の完了を待機する。
 * .message-assistant が存在し、ストリーミング中のインジケータが消えるまで待つ。
 */
export async function waitForStreamingComplete(page: Page, timeout = 15000): Promise<void> {
  // アシスタントメッセージが表示されるまで待つ
  await page.waitForSelector('.message-assistant', { state: 'visible', timeout });
  // ストリーミング中の .streaming クラスが消えるまで待つ（存在する場合）
  await page.waitForFunction(
    () => !document.querySelector('.message-assistant.streaming'),
    { timeout },
  );
}

/**
 * IndexedDB に Heartbeat 結果を直接注入する。
 * テスト実行前に page.addInitScript で呼ぶか、page.evaluate で呼ぶ。
 */
export async function injectHeartbeatResults(
  page: Page,
  results: Array<{
    taskId: string;
    timestamp: number;
    hasChanges: boolean;
    summary: string;
    pinned?: boolean;
    feedback?: { type: string; snoozedUntil?: number };
  }>,
): Promise<void> {
  await page.evaluate((data) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('iagent-db');
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('heartbeat')) {
          db.createObjectStore('heartbeat');
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // heartbeat ストアがない場合は DB バージョンアップが必要
        if (!db.objectStoreNames.contains('heartbeat')) {
          db.close();
          const version = db.version + 1;
          const req2 = indexedDB.open('iagent-db', version);
          req2.onupgradeneeded = () => {
            if (!req2.result.objectStoreNames.contains('heartbeat')) {
              req2.result.createObjectStore('heartbeat');
            }
          };
          req2.onsuccess = () => {
            const db2 = req2.result;
            const tx = db2.transaction('heartbeat', 'readwrite');
            const store = tx.objectStore('heartbeat');
            store.put({ key: 'state', lastChecked: Date.now(), recentResults: data }, 'state');
            tx.oncomplete = () => { db2.close(); resolve(); };
            tx.onerror = () => { db2.close(); reject(tx.error); };
          };
          req2.onerror = () => reject(req2.error);
          return;
        }
        const tx = db.transaction('heartbeat', 'readwrite');
        const store = tx.objectStore('heartbeat');
        store.put({ key: 'state', lastChecked: Date.now(), recentResults: data }, 'state');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }, results);
}
