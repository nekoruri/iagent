import type { Page } from '@playwright/test';
import { injectConfig } from './test-helpers';

/** freezeTime のデフォルト固定時刻。シード関数のデフォルト値にも使用する。 */
export const DEFAULT_FROZEN_TS = 1709449200000;

/**
 * CSS アニメーション・トランジションを全無効化する。
 * Playwright の animations: 'disabled' と二重保証。
 */
export async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
}

/**
 * テーマを切り替える。
 */
export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', t === 'dark' ? '#0f0f0f' : '#ffffff');
    }
  }, theme);
}

/**
 * Date.now() を固定値にモックする。
 * page.goto() の前に呼ぶこと（addInitScript）。
 */
export async function freezeTime(page: Page, timestamp = DEFAULT_FROZEN_TS): Promise<void> {
  await page.addInitScript((ts) => {
    const OrigDate = globalThis.Date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: unknown[]) {
      if (!new.target) {
        // Date() を関数として呼び出した場合は文字列を返す（本来の挙動）
        return new OrigDate(ts).toString();
      }
      if (args.length === 0) return new OrigDate(ts);
      // @ts-expect-error spread constructor
      return new OrigDate(...args);
    };
    MockDate.prototype = OrigDate.prototype;
    MockDate.now = () => ts;
    MockDate.parse = OrigDate.parse;
    MockDate.UTC = OrigDate.UTC;
    globalThis.Date = MockDate;
  }, timestamp);
}

/**
 * VRT テストの共通セットアップ。
 * injectConfig → freezeTime → goto → waitForAppReady → disableAnimations。
 */
export async function setupForVRT(
  page: Page,
  options: {
    skipConfig?: boolean;
    configOverrides?: Record<string, unknown>;
    path?: string;
  } = {},
): Promise<void> {
  const { skipConfig = false, configOverrides = {}, path = '/' } = options;

  if (!skipConfig) {
    await injectConfig(page, configOverrides);
  }
  await freezeTime(page);
  await page.goto(path);

  if (!skipConfig) {
    await page.waitForSelector('.app-container', { state: 'visible' });
  }

  await disableAnimations(page);
}

/**
 * ダーク/ライト両テーマでスクリーンショットを撮影して比較する便利関数。
 * expect(target).toHaveScreenshot() を内部で呼ぶ。
 */
export async function screenshotBothThemes(
  expect: (target: unknown) => { toHaveScreenshot: (name: string, opts?: Record<string, unknown>) => Promise<void> },
  page: Page,
  baseName: string,
  options: {
    locator?: ReturnType<Page['locator']>;
    fullPage?: boolean;
  } = {},
): Promise<void> {
  const { locator, fullPage = false } = options;
  const target = locator ?? page;

  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    // テーマ切替後のレンダリングを待つ
    await page.waitForTimeout(100);
    const screenshotOpts: Record<string, unknown> = {};
    if (!locator && fullPage) {
      screenshotOpts.fullPage = true;
    }
    await expect(target).toHaveScreenshot(`${baseName}-${theme}.png`, screenshotOpts);
  }
}

/**
 * ページロード前に IndexedDB へ Memory データをシードする。
 * page.addInitScript を使い、ページスクリプトより先に IDB を書き込む。
 * page.goto() の前に呼ぶこと。
 */
export async function seedMemories(
  page: Page,
  memories: Array<{
    id: string;
    content: string;
    category?: string;
    importance?: number;
    tags?: string[];
    createdAt?: number;
    updatedAt?: number;
  }>,
): Promise<void> {
  await page.addInitScript(({ memories: data, fallbackTs }) => {
    function writeMemories(db: IDBDatabase) {
      const tx = db.transaction('memories', 'readwrite');
      const store = tx.objectStore('memories');
      for (const mem of data) {
        store.put({
          id: mem.id,
          content: mem.content,
          category: mem.category ?? 'general',
          importance: mem.importance ?? 5,
          tags: mem.tags ?? [],
          createdAt: mem.createdAt ?? fallbackTs,
          updatedAt: mem.updatedAt ?? fallbackTs,
          accessCount: 0,
        });
      }
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    }

    const request = indexedDB.open('iagent-db');
    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains('memories')) {
        writeMemories(db);
        return;
      }
      // ストアが無い場合はバージョンアップして作成
      db.close();
      const req2 = indexedDB.open('iagent-db', db.version + 1);
      req2.onupgradeneeded = () => {
        if (!req2.result.objectStoreNames.contains('memories')) {
          const store = req2.result.createObjectStore('memories', { keyPath: 'id' });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req2.onsuccess = () => writeMemories(req2.result);
    };
  }, { memories, fallbackTs: DEFAULT_FROZEN_TS });
}

/**
 * ページロード前に IndexedDB へ Feed / FeedItem データをシードする。
 * page.addInitScript を使い、ページスクリプトより先に IDB を書き込む。
 * page.goto() の前に呼ぶこと。
 */
export async function seedFeedItems(
  page: Page,
  items: Array<{
    id: string;
    feedId: string;
    title: string;
    url?: string;
    summary?: string;
    publishedAt?: number;
    guid?: string;
  }>,
  feeds: Array<{
    id: string;
    title: string;
    url?: string;
    lastFetchedAt?: number;
  }> = [],
): Promise<void> {
  await page.addInitScript(({ items: feedItems, feeds: feedList, fallbackTs }) => {
    function writeFeedData(db: IDBDatabase) {
      const tx = db.transaction(['feeds', 'feed-items'], 'readwrite');
      const feedStore = tx.objectStore('feeds');
      const itemStore = tx.objectStore('feed-items');
      for (const feed of feedList) {
        feedStore.put({
          id: feed.id,
          title: feed.title,
          url: feed.url ?? `https://example.com/${feed.id}/rss`,
          lastFetchedAt: feed.lastFetchedAt ?? fallbackTs,
        });
      }
      for (const item of feedItems) {
        itemStore.put({
          id: item.id,
          feedId: item.feedId,
          title: item.title,
          url: item.url ?? `https://example.com/article/${item.id}`,
          summary: item.summary ?? '',
          publishedAt: item.publishedAt ?? fallbackTs,
          guid: item.guid ?? item.id,
        });
      }
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    }

    const request = indexedDB.open('iagent-db');
    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains('feeds') && db.objectStoreNames.contains('feed-items')) {
        writeFeedData(db);
        return;
      }
      // ストアが無い場合はバージョンアップして作成
      db.close();
      const req2 = indexedDB.open('iagent-db', db.version + 1);
      req2.onupgradeneeded = () => {
        const upgradeDb = req2.result;
        if (!upgradeDb.objectStoreNames.contains('feeds')) {
          upgradeDb.createObjectStore('feeds', { keyPath: 'id' });
        }
        if (!upgradeDb.objectStoreNames.contains('feed-items')) {
          const feedItemStore = upgradeDb.createObjectStore('feed-items', { keyPath: 'id' });
          feedItemStore.createIndex('feedId', 'feedId', { unique: false });
          feedItemStore.createIndex('publishedAt', 'publishedAt', { unique: false });
          feedItemStore.createIndex('guid', 'guid', { unique: false });
        }
      };
      req2.onsuccess = () => writeFeedData(req2.result);
    };
  }, { items, feeds, fallbackTs: DEFAULT_FROZEN_TS });
}
