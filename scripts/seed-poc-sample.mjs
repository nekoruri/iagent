#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

function printHelp() {
  console.log(`Usage: node scripts/seed-poc-sample.mjs [options]

Options:
  --url <url>            Target app URL (default: http://localhost:5173)
  --user-data-dir <dir>  Persistent Chromium profile (default: /tmp/iagent-metrics-profile)
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = {
    url: 'http://localhost:5173',
    userDataDir: '/tmp/iagent-metrics-profile',
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--url') {
      args.url = argv[i + 1] ?? args.url;
      i++;
      continue;
    }
    if (arg === '--user-data-dir') {
      args.userDataDir = argv[i + 1] ?? args.userDataDir;
      i++;
    }
  }

  return args;
}

export function buildSeedPayload(nowTs) {
  const dayMs = 24 * 60 * 60 * 1000;
  const sessionId = `wizard-${nowTs}-seed`;
  const dayOffsets = [0, 1, 2, 3];
  const feedbackTypes = ['accepted', 'accepted', 'accepted', 'dismissed'];
  const taskIds = ['rss-digest-daily', 'briefing-morning', 'feed-check', 'calendar-check'];
  const summaries = [
    '朝のRSSダイジェストを確認',
    '朝ブリーフィングを確認',
    '重要フィードを確認',
    '予定リマインドは今回は不要',
  ];
  const sources = ['tab', 'push', 'periodic-sync', 'tab'];

  const recentResults = dayOffsets.map((offset, index) => {
    const timestamp = nowTs - offset * dayMs - (20 + index * 3) * 60 * 1000;
    return {
      taskId: taskIds[index],
      timestamp,
      hasChanges: true,
      summary: summaries[index],
      source: sources[index],
      feedback: {
        type: feedbackTypes[index],
        timestamp: timestamp + 30_000,
      },
    };
  });

  const feedbackEvents = recentResults.map((result) => ({
    type: 'heartbeat-feedback',
    timestamp: result.feedback.timestamp,
    source: result.source,
    taskId: result.taskId,
    resultTimestamp: result.timestamp,
    feedbackType: result.feedback.type,
  }));

  const setupStartedAt = nowTs - 3 * dayMs - 120 * 60 * 1000;
  const setupCompletedAt = setupStartedAt + 4 * 60 * 1000;

  return {
    state: {
      key: 'state',
      lastChecked: nowTs - 2 * 60 * 1000,
      recentResults,
    },
    opsEvents: {
      key: 'ops-events',
      events: [
        {
          type: 'setup-wizard',
          timestamp: setupStartedAt,
          source: 'tab',
          wizardSessionId: sessionId,
          wizardAction: 'start',
          wizardStep: 0,
        },
        {
          type: 'setup-wizard',
          timestamp: setupStartedAt + 2 * 60 * 1000,
          source: 'tab',
          wizardSessionId: sessionId,
          wizardAction: 'preset-applied',
          wizardStep: 1,
          wizardPresetLabel: '推奨プリセット',
          wizardPresetRecommended: true,
          wizardSuggestionFrequency: 'high',
          wizardEnabledTaskCount: 4,
        },
        {
          type: 'setup-wizard',
          timestamp: setupCompletedAt,
          source: 'tab',
          wizardSessionId: sessionId,
          wizardAction: 'completed',
          wizardStep: 2,
          wizardPresetLabel: '推奨プリセット',
          wizardPresetRecommended: true,
          wizardSuggestionFrequency: 'high',
          wizardEnabledTaskCount: 4,
        },
        {
          type: 'heartbeat-run',
          timestamp: nowTs - 50 * 60 * 1000,
          source: 'tab',
          status: 'success',
          durationMs: 1200,
          taskCount: 3,
          resultCount: 2,
          changedCount: 2,
        },
        {
          type: 'heartbeat-run',
          timestamp: nowTs - 40 * 60 * 1000,
          source: 'push',
          status: 'success',
          durationMs: 1800,
          taskCount: 2,
          resultCount: 1,
          changedCount: 1,
        },
        {
          type: 'notification-shown',
          timestamp: nowTs - 39 * 60 * 1000,
          channel: 'push',
          notificationTag: 'heartbeat-result',
          notificationId: 'seed-notif-push-1',
        },
        {
          type: 'notification-clicked',
          timestamp: nowTs - 38 * 60 * 1000,
          channel: 'push',
          notificationTag: 'heartbeat-result',
          notificationId: 'seed-notif-push-1',
        },
        {
          type: 'notification-shown',
          timestamp: nowTs - 30 * 60 * 1000,
          channel: 'desktop',
          notificationTag: 'heartbeat-result',
          notificationId: 'seed-notif-desktop-1',
        },
        {
          type: 'notification-clicked',
          timestamp: nowTs - 29 * 60 * 1000,
          channel: 'desktop',
          notificationTag: 'heartbeat-result',
          notificationId: 'seed-notif-desktop-1',
        },
        ...feedbackEvents,
      ],
    },
  };
}

export async function seedPageWithSample(page, nowTs = Date.now()) {
  const seedPayload = buildSeedPayload(nowTs);
  return page.evaluate(async ({ state, opsEvents }) => {
    await new Promise((resolve, reject) => {
      function write(db) {
        const tx = db.transaction('heartbeat', 'readwrite');
        const store = tx.objectStore('heartbeat');
        store.put(state);
        store.put(opsEvents);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }

      const req = indexedDB.open('iagent-db');
      req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('heartbeat')) {
          const nextVersion = db.version + 1;
          db.close();
          const upgradeReq = indexedDB.open('iagent-db', nextVersion);
          upgradeReq.onupgradeneeded = () => {
            if (!upgradeReq.result.objectStoreNames.contains('heartbeat')) {
              upgradeReq.result.createObjectStore('heartbeat', { keyPath: 'key' });
            }
          };
          upgradeReq.onerror = () => reject(upgradeReq.error ?? new Error('Failed to upgrade IndexedDB'));
          upgradeReq.onsuccess = () => write(upgradeReq.result);
          return;
        }
        write(db);
      };
    });
    const verifyDb = await new Promise((resolve, reject) => {
      const req = indexedDB.open('iagent-db');
      req.onerror = () => reject(req.error ?? new Error('Failed to reopen IndexedDB'));
      req.onsuccess = () => resolve(req.result);
    });
    const verifyTx = verifyDb.transaction('heartbeat', 'readonly');
    const savedState = await new Promise((resolve, reject) => {
      const req = verifyTx.objectStore('heartbeat').get('state');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result ?? null);
    });
    const savedOps = await new Promise((resolve, reject) => {
      const req = verifyTx.objectStore('heartbeat').get('ops-events');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result ?? null);
    });
    verifyDb.close();
    return {
      resultCount: Array.isArray(savedState?.recentResults) ? savedState.recentResults.length : 0,
      opsCount: Array.isArray(savedOps?.events) ? savedOps.events.length : 0,
    };
  }, seedPayload);
}

async function seedProfile(url, userDataDir) {
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const writeResult = await seedPageWithSample(page);
  await context.close();
  return writeResult;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const result = await seedProfile(opts.url, opts.userDataDir);
  console.log(`[seed-poc-sample] seeded ${opts.userDataDir} results=${result.resultCount} ops=${result.opsCount}`);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  main().catch((error) => {
    console.error('[seed-poc-sample] Failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
