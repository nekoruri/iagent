import { test, expect, type BrowserContext, type CDPSession } from '@playwright/test';

/**
 * Push 通知統合テスト
 *
 * CDP (Chrome DevTools Protocol) の ServiceWorker.deliverPushMessage を使い、
 * 実際の Push 購読なしに SW へ直接 Push イベントを配信する。
 *
 * フロー:
 *   1. IndexedDB に API キー・Heartbeat 設定を書き込む
 *   2. SW が activated になるのを確認
 *   3. CDP 経由で Push メッセージを配信
 *   4. SW コンソールログ [Heartbeat:push] 完了を検証
 *
 * 前提:
 *   - Vite preview (4173) がビルド済み（VITE_OPENAI_API_URL 注入済み）
 *   - OpenAI モック HTTP サーバー (4100) が起動中
 */

test.describe('Push 通知統合テスト', () => {
  test('Push 受信 → Heartbeat 実行 → 完了ログ出力', async ({ page, context }) => {
    // 通知パーミッションを付与（SW の showNotification に必要）
    await context.grantPermissions(['notifications']);

    // --- 1. アプリ表示 + IndexedDB に設定注入 ---
    await page.goto('/');
    await page.waitForSelector('.app-container', { state: 'visible', timeout: 30_000 });

    // IndexedDB に設定を書き込む（SW が読み取る config ストア）
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('iagent-db', 11);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const [name, keyPath] of [
            ['config', 'key'], ['calendar', 'id'], ['heartbeat', 'key'],
            ['memories', 'id'], ['conversations', 'id'], ['traces', 'traceId'],
            ['conversation-meta', 'id'], ['clips', 'id'], ['feeds', 'id'],
            ['feed-items', 'id'], ['monitors', 'id'], ['memories_archive', 'id'],
            ['attachments', 'id'],
          ] as const) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath });
            }
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('config', 'readwrite');
          tx.objectStore('config').put({
            key: 'app-config',
            openaiApiKey: 'test-api-key-push-e2e',
            braveApiKey: '',
            openWeatherMapApiKey: '',
            mcpServers: [],
            heartbeat: {
              enabled: true,
              intervalMinutes: 1,
              quietHoursStart: 0,
              quietHoursEnd: 0,
              tasks: [
                {
                  id: 'e2e-test-task',
                  name: 'E2E テストタスク',
                  description: 'Push 通知テスト用ダミータスク',
                  enabled: true,
                  type: 'custom',
                },
              ],
              desktopNotification: true,
            },
            push: { enabled: true, serverUrl: '' },
            otel: {
              enabled: false, endpoint: '', headers: {},
              batchSize: 10, flushIntervalMs: 30000,
            },
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        request.onerror = () => reject(request.error);
      });
    });

    // --- 2. SW が activated になるのを確認 ---
    const swReady = await page.evaluate(() =>
      navigator.serviceWorker.ready.then((reg) => !!reg.active),
    );
    expect(swReady).toBe(true);

    // --- 3. SW コンソールログ監視を開始 ---
    const logs: string[] = [];
    setupSWLogCollector(context, logs);

    // --- 4. CDP 経由で Push メッセージを配信 ---
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('ServiceWorker.enable');

      const registrationId = await getRegistrationId(cdp, page.url());
      console.log('SW registrationId:', registrationId);

      await cdp.send('ServiceWorker.deliverPushMessage', {
        origin: new URL(page.url()).origin,
        registrationId,
        data: JSON.stringify({ type: 'heartbeat-wake' }),
      });
      console.log('CDP Push メッセージ配信完了');
    } finally {
      await cdp.detach().catch(() => {});
    }

    // --- 5. 検証: [Heartbeat:push] 完了ログが出力されるまで待機 ---
    await expect.poll(
      () => logs.find((log) => log.includes('[Heartbeat:push]') && log.includes('完了')),
      { timeout: 60_000, intervals: [500] },
    ).toBeTruthy();

    console.log('SW ログ:', logs.filter((l) => l.includes('[Heartbeat') || l.includes('[SW]')));
  });
});

/** CDP workerRegistrationUpdated イベントから registrationId を取得する */
function getRegistrationId(cdp: CDPSession, pageUrl: string): Promise<string> {
  const origin = new URL(pageUrl).origin;

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('ServiceWorker registrationId 取得タイムアウト'));
    }, 15_000);

    cdp.on('ServiceWorker.workerRegistrationUpdated', (params: {
      registrations: Array<{ registrationId: string; scopeURL: string; isDeleted: boolean }>;
    }) => {
      for (const reg of params.registrations) {
        if (reg.scopeURL.startsWith(origin) && !reg.isDeleted) {
          clearTimeout(timeout);
          resolve(reg.registrationId);
          return;
        }
      }
    });
  });
}

/** SW のコンソールログを収集するセットアップ */
function setupSWLogCollector(context: BrowserContext, logs: string[]): void {
  for (const worker of context.serviceWorkers()) {
    worker.on('console', (msg) => logs.push(msg.text()));
  }
  context.on('serviceworker', (worker) => {
    worker.on('console', (msg) => logs.push(msg.text()));
  });
}
