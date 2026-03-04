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
      const sloCutoff = Date.now() - dayMs;

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

      async function readOpsEvents() {
        return new Promise((resolve, reject) => {
          const tx = db.transaction('heartbeat', 'readonly');
          const req = tx.objectStore('heartbeat').get('ops-events');
          req.onerror = () => reject(req.error ?? new Error('Failed to read ops events'));
          req.onsuccess = () => resolve(req.result?.events ?? []);
        });
      }

      const db = await openDb();

      try {
        const heartbeatState = await readHeartbeatState();
        const recentResults = heartbeatState?.recentResults ?? [];
        const conversations = await readAll('conversations');
        const opsEvents = await readOpsEvents();

        let accepted = 0;
        let dismissed = 0;
        let snoozed = 0;
        const activeDays = new Set();

        for (const msg of conversations) {
          if (msg?.role === 'user' && typeof msg.timestamp === 'number' && msg.timestamp >= cutoff) {
            activeDays.add(new Date(msg.timestamp).toISOString().slice(0, 10));
          }
        }

        for (const r of recentResults) {
          if (typeof r?.timestamp !== 'number' || r.timestamp < cutoff) continue;

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

        const kpiOpsEvents = Array.isArray(opsEvents)
          ? opsEvents.filter((e) => typeof e?.timestamp === 'number' && e.timestamp >= cutoff)
          : [];
        const shown = kpiOpsEvents.filter((e) => e?.type === 'notification-shown');
        const clicked = kpiOpsEvents.filter((e) => e?.type === 'notification-clicked');
        const shownIds = new Set();
        const fallbackShownKeys = new Set();
        for (const e of shown) {
          if (typeof e?.notificationId === 'string' && e.notificationId.length > 0) {
            shownIds.add(e.notificationId);
            continue;
          }
          // 旧イベント（notificationId未保存）向けフォールバック
          fallbackShownKeys.add(`${e?.channel ?? 'unknown'}:${e?.notificationTag ?? 'n/a'}`);
        }

        let clickedMatched = 0;
        let clickedUnmatched = 0;
        const clickedMatchedIds = new Set();
        const clickedMatchedFallbackKeys = new Set();
        for (const e of clicked) {
          const id = typeof e?.notificationId === 'string' ? e.notificationId : '';
          if (id) {
            if (shownIds.has(id) && !clickedMatchedIds.has(id)) {
              clickedMatched++;
              clickedMatchedIds.add(id);
            } else if (!shownIds.has(id)) {
              clickedUnmatched++;
            }
            continue;
          }
          const fallbackKey = `${e?.channel ?? 'unknown'}:${e?.notificationTag ?? 'n/a'}`;
          if (fallbackShownKeys.has(fallbackKey) && !clickedMatchedFallbackKeys.has(fallbackKey)) {
            clickedMatched++;
            clickedMatchedFallbackKeys.add(fallbackKey);
          } else if (!fallbackShownKeys.has(fallbackKey)) {
            clickedUnmatched++;
          }
        }

        const revisitRate = shown.length > 0 ? clickedMatched / shown.length : 0;

        const shownByChannel = { desktop: 0, push: 0, periodicSync: 0, unknown: 0 };
        const clickedByChannel = { desktop: 0, push: 0, periodicSync: 0, unknown: 0 };
        for (const e of shown) {
          if (e?.channel === 'desktop') shownByChannel.desktop++;
          else if (e?.channel === 'push') shownByChannel.push++;
          else if (e?.channel === 'periodic-sync') shownByChannel.periodicSync++;
          else shownByChannel.unknown++;
        }
        for (const e of clicked) {
          if (e?.channel === 'desktop') clickedByChannel.desktop++;
          else if (e?.channel === 'push') clickedByChannel.push++;
          else if (e?.channel === 'periodic-sync') clickedByChannel.periodicSync++;
          else clickedByChannel.unknown++;
        }

        const sloEvents = Array.isArray(opsEvents)
          ? opsEvents.filter((e) => typeof e?.timestamp === 'number' && e.timestamp >= sloCutoff && e?.type === 'heartbeat-run')
          : [];
        const heartbeatAttempts = sloEvents.filter((e) => e?.status === 'success' || e?.status === 'failure');
        const heartbeatSuccess = heartbeatAttempts.filter((e) => e?.status === 'success').length;
        const heartbeatFailure = heartbeatAttempts.length - heartbeatSuccess;
        const heartbeatSkipped = sloEvents.filter((e) => e?.status === 'skipped').length;
        const heartbeatSuccessRate = heartbeatAttempts.length > 0 ? heartbeatSuccess / heartbeatAttempts.length : 0;

        const pushAttempts = heartbeatAttempts.filter((e) => e?.source === 'push' || e?.source === 'periodic-sync');
        const pushSuccess = pushAttempts.filter((e) => e?.status === 'success').length;
        const pushFailure = pushAttempts.length - pushSuccess;
        const pushSkipped = sloEvents.filter(
          (e) => (e?.source === 'push' || e?.source === 'periodic-sync') && e?.status === 'skipped',
        ).length;
        const pushSuccessRate = pushAttempts.length > 0 ? pushSuccess / pushAttempts.length : 0;

        const durationSamples = heartbeatAttempts
          .map((e) => Number(e?.durationMs))
          .filter((n) => Number.isFinite(n) && n >= 0);
        const p95DurationMs = durationSamples.length > 0
          ? (() => {
              const sorted = [...durationSamples].sort((a, b) => a - b);
              const index = Math.ceil(sorted.length * 0.95) - 1;
              return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
            })()
          : null;

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
            revisitRate: {
              shown: shown.length,
              clicked: clickedMatched,
              unmatchedClicks: clickedUnmatched,
              rate: revisitRate,
              shownByChannel,
              clickedByChannel,
            },
          },
          slo24h: {
            heartbeatRunSuccess: {
              attempts: heartbeatAttempts.length,
              success: heartbeatSuccess,
              failure: heartbeatFailure,
              skipped: heartbeatSkipped,
              rate: heartbeatSuccessRate,
            },
            pushWakeSuccess: {
              attempts: pushAttempts.length,
              success: pushSuccess,
              failure: pushFailure,
              skipped: pushSkipped,
              rate: pushSuccessRate,
            },
            heartbeatDurationP95: {
              p95Ms: p95DurationMs,
              sampleSize: durationSamples.length,
            },
          },
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
    console.log(`- notificationShown: ${result.kpi.revisitRate.shown}`);
    console.log(`- notificationClicked: ${result.kpi.revisitRate.clicked}`);
    console.log(`- unmatchedClicks: ${result.kpi.revisitRate.unmatchedClicks}`);
    console.log(`- revisitRate: ${toPercent(result.kpi.revisitRate.rate)} (${result.kpi.revisitRate.rate.toFixed(4)})`);
    console.log(`- shownByChannel: ${JSON.stringify(result.kpi.revisitRate.shownByChannel)}`);
    console.log(`- clickedByChannel: ${JSON.stringify(result.kpi.revisitRate.clickedByChannel)}`);
    console.log(`- slo24hHeartbeatAttempts: ${result.slo24h.heartbeatRunSuccess.attempts}`);
    console.log(`- slo24hHeartbeatSuccess: ${result.slo24h.heartbeatRunSuccess.success}`);
    console.log(`- slo24hHeartbeatFailure: ${result.slo24h.heartbeatRunSuccess.failure}`);
    console.log(`- slo24hHeartbeatSkipped: ${result.slo24h.heartbeatRunSuccess.skipped}`);
    console.log(`- slo24hHeartbeatSuccessRate: ${toPercent(result.slo24h.heartbeatRunSuccess.rate)} (${result.slo24h.heartbeatRunSuccess.rate.toFixed(4)})`);
    console.log(`- slo24hPushAttempts: ${result.slo24h.pushWakeSuccess.attempts}`);
    console.log(`- slo24hPushSuccess: ${result.slo24h.pushWakeSuccess.success}`);
    console.log(`- slo24hPushFailure: ${result.slo24h.pushWakeSuccess.failure}`);
    console.log(`- slo24hPushSkipped: ${result.slo24h.pushWakeSuccess.skipped}`);
    console.log(`- slo24hPushSuccessRate: ${toPercent(result.slo24h.pushWakeSuccess.rate)} (${result.slo24h.pushWakeSuccess.rate.toFixed(4)})`);
    console.log(`- slo24hHeartbeatP95Ms: ${result.slo24h.heartbeatDurationP95.p95Ms ?? 'n/a'}`);
    if (typeof result.slo24h.heartbeatDurationP95.p95Ms === 'number') {
      console.log(`- slo24hHeartbeatP95Sec: ${(result.slo24h.heartbeatDurationP95.p95Ms / 1000).toFixed(2)}`);
    }
    console.log(`- slo24hHeartbeatDurationSamples: ${result.slo24h.heartbeatDurationP95.sampleSize}`);
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
