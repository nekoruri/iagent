#!/usr/bin/env node

import { chromium } from '@playwright/test';

const DAY_MS = 24 * 60 * 60 * 1000;

function printHelp() {
  console.log(`Usage: npm run metrics:poc -- [options]

Options:
  --url <url>       Target app URL (default: http://localhost:5173)
  --days <n>        Rolling window days (default: 7)
  --user-data-dir   Chromium user data directory for persistent profile
  --headed          Run browser in headed mode
  --help            Show this help

Examples:
  npm run metrics:poc
  npm run metrics:poc -- --url http://localhost:4173 --days 7
  npm run metrics:poc -- --user-data-dir /tmp/iagent-metrics-profile
`);
}

function parseArgs(argv) {
  const args = {
    url: 'http://localhost:5173',
    days: 7,
    userDataDir: '',
    headed: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
    if (a === '--headed') {
      args.headed = true;
      continue;
    }
    if (a === '--url') {
      args.url = argv[i + 1] ?? args.url;
      i++;
      continue;
    }
    if (a === '--user-data-dir') {
      args.userDataDir = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--days') {
      const raw = Number(argv[i + 1]);
      if (Number.isFinite(raw) && raw > 0) args.days = Math.floor(raw);
      i++;
      continue;
    }
  }
  return args;
}

function toPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function isoDate(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function localDateTime(ts) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(new Date(ts));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const browser = opts.userDataDir
    ? null
    : await chromium.launch({ headless: !opts.headed });
  const context = opts.userDataDir
    ? await chromium.launchPersistentContext(opts.userDataDir, { headless: !opts.headed })
    : await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const result = await page.evaluate(async ({ days, dayMs }) => {
      const cutoff = Date.now() - days * dayMs;

      function openDb() {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open('iagent-db');
          req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
          req.onsuccess = () => resolve(req.result);
        });
      }

      async function readAll(storeName) {
        return new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).getAll();
          req.onerror = () => reject(req.error ?? new Error(`Failed to read ${storeName}`));
          req.onsuccess = () => resolve(req.result ?? []);
        });
      }

      async function readHeartbeatState() {
        return new Promise((resolve, reject) => {
          const tx = db.transaction('heartbeat', 'readonly');
          const req = tx.objectStore('heartbeat').get('state');
          req.onerror = () => reject(req.error ?? new Error('Failed to read heartbeat state'));
          req.onsuccess = () => resolve(req.result ?? null);
        });
      }

      const db = await openDb();

      try {
        const heartbeatState = await readHeartbeatState();
        const recentResults = heartbeatState?.recentResults ?? [];
        const conversations = await readAll('conversations');

        let accepted = 0;
        let dismissed = 0;
        let snoozed = 0;
        let totalHasChanges = 0;
        let hasFeedback = 0;

        const activeDays = new Set();

        for (const msg of conversations) {
          if (msg?.role === 'user' && typeof msg.timestamp === 'number' && msg.timestamp >= cutoff) {
            activeDays.add(new Date(msg.timestamp).toISOString().slice(0, 10));
          }
        }

        for (const r of recentResults) {
          if (typeof r?.timestamp !== 'number' || r.timestamp < cutoff) continue;

          if (r.hasChanges) {
            totalHasChanges++;
            if (r.feedback) hasFeedback++;
          }

          if (r.feedback) {
            if (r.feedback.type === 'accepted') accepted++;
            if (r.feedback.type === 'dismissed') dismissed++;
            if (r.feedback.type === 'snoozed') snoozed++;
            if (typeof r.feedback.timestamp === 'number' && r.feedback.timestamp >= cutoff) {
              activeDays.add(new Date(r.feedback.timestamp).toISOString().slice(0, 10));
            }
          }
        }

        const feedbackTotal = accepted + dismissed + snoozed;
        const acceptRate = feedbackTotal > 0 ? accepted / feedbackTotal : 0;
        const activeRate = activeDays.size / days;
        const proxyRevisitRate = totalHasChanges > 0 ? hasFeedback / totalHasChanges : 0;

        return {
          windowDays: days,
          kpi: {
            acceptRate: {
              accepted,
              dismissed,
              snoozed,
              total: feedbackTotal,
              rate: acceptRate,
            },
            activeRate: {
              activeDays: activeDays.size,
              rate: activeRate,
              days: Array.from(activeDays).sort(),
            },
            proxyRevisitRate: {
              totalHasChanges,
              hasFeedback,
              rate: proxyRevisitRate,
            },
          },
          note: 'SLO baseline は運用ログから別途記録してください',
        };
      } finally {
        db.close();
      }
    }, { days: opts.days, dayMs: DAY_MS });

    console.log('=== PoC KPI Snapshot ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n=== Markdown Paste Helper ===');
    console.log(`- accepted: ${result.kpi.acceptRate.accepted}`);
    console.log(`- dismissed: ${result.kpi.acceptRate.dismissed}`);
    console.log(`- snoozed: ${result.kpi.acceptRate.snoozed}`);
    console.log(`- total: ${result.kpi.acceptRate.total}`);
    console.log(`- acceptRate: ${toPercent(result.kpi.acceptRate.rate)} (${result.kpi.acceptRate.rate.toFixed(4)})`);
    console.log(`- activeDays: ${result.kpi.activeRate.activeDays}`);
    console.log(`- activeRate: ${toPercent(result.kpi.activeRate.rate)} (${result.kpi.activeRate.rate.toFixed(4)})`);
    console.log(`- days: ${result.kpi.activeRate.days.join(', ')}`);
    console.log(`- totalHasChanges: ${result.kpi.proxyRevisitRate.totalHasChanges}`);
    console.log(`- hasFeedback: ${result.kpi.proxyRevisitRate.hasFeedback}`);
    console.log(`- proxyRevisitRate: ${toPercent(result.kpi.proxyRevisitRate.rate)} (${result.kpi.proxyRevisitRate.rate.toFixed(4)})`);
    const now = Date.now();
    console.log(`- collectedAtLocal: ${localDateTime(now)}`);
    console.log(`- collectedAtUtcDate: ${isoDate(now)}`);
    if (!opts.userDataDir) {
      console.log('- note: デフォルトは一時プロファイルで実行されるため、既存ブラウザの利用データは含まれません');
    }
  } finally {
    await context.close();
    if (browser) await browser.close();
  }
}

main().catch((error) => {
  console.error('[metrics:poc] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
