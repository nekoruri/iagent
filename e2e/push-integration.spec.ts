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
    await context.grantPermissions(['notifications'], { origin: 'http://localhost:4173' });

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

    // --- 5. 検証: push 起点の heartbeat-run が記録されるまで待機 ---
    await expect.poll(
      async () => page.evaluate(async () => {
        return new Promise<Record<string, unknown> | null>((resolve, reject) => {
          const request = indexedDB.open('iagent-db');
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('heartbeat', 'readonly');
            const getReq = tx.objectStore('heartbeat').get('ops-events');
            getReq.onsuccess = () => {
              const events = Array.isArray(getReq.result?.events) ? getReq.result.events : [];
              const latestPushRun = [...events]
                .reverse()
                .find((event) => event?.type === 'heartbeat-run' && event?.source === 'push');
              resolve(latestPushRun ?? null);
              db.close();
            };
            getReq.onerror = () => {
              reject(getReq.error);
              db.close();
            };
          };
          request.onerror = () => reject(request.error);
        });
      }),
      { timeout: 60_000, intervals: [500] },
    ).not.toBeNull();

    console.log('SW ログ:', logs.filter((l) => l.includes('[Heartbeat') || l.includes('[SW]')));
  });

  test('Push 実行エラー時は SW ログと failure ops-event を記録する', async ({ page, context }) => {
    await context.grantPermissions(['notifications'], { origin: 'http://localhost:4173' });

    await page.goto('/');
    await page.waitForSelector('.app-container', { state: 'visible', timeout: 30_000 });

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
            openaiApiKey: 'test-api-key-push-e2e-error',
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
                  description: 'Push 通知エラーテスト用ダミータスク',
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

    const swReady = await page.evaluate(() =>
      navigator.serviceWorker.ready.then((reg) => !!reg.active),
    );
    expect(swReady).toBe(true);

    const logs: string[] = [];
    setupSWLogCollector(context, logs);

    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('ServiceWorker.enable');

      const registrationId = await getRegistrationId(cdp, page.url());
      await cdp.send('ServiceWorker.deliverPushMessage', {
        origin: new URL(page.url()).origin,
        registrationId,
        data: JSON.stringify({ type: 'heartbeat-wake' }),
      });
    } finally {
      await cdp.detach().catch(() => {});
    }

    await expect.poll(
      () => logs.find((log) => log.includes('[SW] Heartbeat push エラー:')),
      { timeout: 60_000, intervals: [500] },
    ).toBeTruthy();

    await expect.poll(
      async () => page.evaluate(async () => {
        return new Promise<Record<string, unknown> | null>((resolve, reject) => {
          const request = indexedDB.open('iagent-db');
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('heartbeat', 'readonly');
            const getReq = tx.objectStore('heartbeat').get('ops-events');
            getReq.onsuccess = () => {
              const events = Array.isArray(getReq.result?.events) ? getReq.result.events : [];
              const latestPushFailure = [...events]
                .reverse()
                .find((event) => event?.type === 'heartbeat-run'
                  && event?.source === 'push'
                  && event?.status === 'failure');
              resolve(latestPushFailure ?? null);
              db.close();
            };
            getReq.onerror = () => {
              reject(getReq.error);
              db.close();
            };
          };
          request.onerror = () => reject(request.error);
        });
      }),
      { timeout: 60_000, intervals: [500] },
    ).toEqual(expect.objectContaining({
      type: 'heartbeat-run',
      source: 'push',
      status: 'failure',
      errorMessage: expect.stringContaining('OpenAI API エラー (500)'),
    }));
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
