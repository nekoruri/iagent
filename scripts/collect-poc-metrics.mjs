#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WEEKLY_DIR = 'docs/weekly';

function printHelp() {
  console.log(`Usage: npm run metrics:poc -- [options]

Options:
  --url <url>       Target app URL (default: http://localhost:5173)
  --days <n>        Rolling window days (default: 7)
  --user-data-dir   Chromium user data directory for persistent profile
  --week <YYYY-W##> Auto-resolve weekly and baseline file paths
  --weekly-review   Update weekly review markdown file in-place
  --baseline        Update baseline markdown file in-place
  --fail-on-action  Exit with code 2 when KPI or SLO overall status is Action
  --headed          Run browser in headed mode
  --help            Show this help

Examples:
  npm run metrics:poc
  npm run metrics:poc -- --url http://localhost:4173 --days 7
  npm run metrics:poc -- --user-data-dir /tmp/iagent-metrics-profile
  npm run metrics:poc -- --week 2026-W10 --user-data-dir /tmp/iagent-metrics-profile
  npm run metrics:poc -- --weekly-review /tmp/WEEKLY.md --baseline /tmp/WEEKLY-baseline.md
  npm run metrics:poc -- --weekly-review docs/weekly/2026-W10.md
  npm run metrics:poc -- --baseline docs/weekly/2026-W10-baseline.md
  npm run metrics:poc -- --week 2026-W10 --fail-on-action
`);
}

function parseArgs(argv) {
  const args = {
    url: 'http://localhost:5173',
    days: 7,
    userDataDir: '',
    week: '',
    weeklyReview: '',
    baseline: '',
    failOnAction: false,
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
    if (a === '--fail-on-action') {
      args.failOnAction = true;
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
    if (a === '--week') {
      args.week = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--weekly-review') {
      args.weeklyReview = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--baseline') {
      args.baseline = argv[i + 1] ?? '';
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

function classifyHigherBetter(value, { good, watch }) {
  if (value >= good) return 'Good';
  if (value >= watch) return 'Watch';
  return 'Action';
}

function classifySloSuccessRate(rate, attempts, { target, alert }) {
  if (attempts <= 0) return 'NoData';
  if (rate >= target) return 'Good';
  if (rate >= alert) return 'Watch';
  return 'Action';
}

function classifySloLatencyMs(p95Ms, sampleSize, { targetMs, alertMs }) {
  if (sampleSize <= 0 || typeof p95Ms !== 'number') return 'NoData';
  if (p95Ms <= targetMs) return 'Good';
  if (p95Ms <= alertMs) return 'Watch';
  return 'Action';
}

function worstStatus(statuses) {
  const rank = {
    Action: 4,
    Watch: 3,
    NoData: 2,
    Good: 1,
  };
  let worst = 'Good';
  for (const status of statuses) {
    if ((rank[status] ?? 0) > (rank[worst] ?? 0)) {
      worst = status;
    }
  }
  return worst;
}

function lineReplace(content, regex, line) {
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

function localDate(ts) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(ts)).replaceAll('/', '-');
}

function localDateTimeMinute(ts) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(new Date(ts)).replaceAll('/', '-');
}

function replaceSection(content, header, transformFn) {
  const marker = `## ${header}`;
  const start = content.indexOf(marker);
  if (start < 0) return content;
  const next = content.indexOf('\n## ', start + marker.length);
  const end = next >= 0 ? next + 1 : content.length;
  const section = content.slice(start, end);
  const updated = transformFn(section);
  return `${content.slice(0, start)}${updated}${content.slice(end)}`;
}

function appendExecutionDateLog(content, line) {
  const marker = '- 実施日:';
  const start = content.indexOf(marker);
  if (start < 0) return content;
  const blockStart = start + marker.length;
  const blockEnd = content.indexOf('\n- 実施者:', blockStart);
  if (blockEnd < 0) return content;
  const block = content.slice(blockStart, blockEnd);
  if (block.includes(line.trim())) return content;
  let normalizedBlock = block.replace(/\n+$/, '\n');
  if (!normalizedBlock.endsWith('\n')) {
    normalizedBlock = `${normalizedBlock}\n`;
  }
  const nextBlock = `${normalizedBlock}${line}\n`;
  const rest = content.slice(blockEnd).replace(/^\n+/, '');
  return `${content.slice(0, blockStart)}${nextBlock}${rest}`;
}

function isValidWeek(week) {
  return /^\d{4}-W\d{2}$/.test(week);
}

function resolveOutputPaths(opts) {
  if (opts.week && !isValidWeek(opts.week)) {
    throw new Error(`Invalid --week format: ${opts.week} (expected YYYY-W##)`);
  }

  const resolvedWeeklyReview = opts.weeklyReview
    || (opts.week ? `${DEFAULT_WEEKLY_DIR}/${opts.week}.md` : '');
  const resolvedBaseline = opts.baseline
    || (opts.week ? `${DEFAULT_WEEKLY_DIR}/${opts.week}-baseline.md` : '');

  return {
    weeklyReview: resolvedWeeklyReview,
    baseline: resolvedBaseline,
  };
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function inferWeekFromPath(path) {
  if (!path) return '';
  const m = path.match(/(\d{4}-W\d{2})(?:-baseline)?\.md$/);
  return m?.[1] ?? '';
}

function applyTemplateValues(template, week, collectedAtTs, kind) {
  let out = template;
  if (week) {
    out = out.replaceAll('YYYY-W##', week);
    if (kind === 'weekly') {
      out = out.replace(/^# PoC 週次レビュー テンプレート$/m, `# PoC 週次レビュー: ${week}`);
    }
  }
  out = out.replaceAll('YYYY-MM-DD', localDate(collectedAtTs));
  return out;
}

async function ensureOutputFile(filePath, kind, week, collectedAtTs) {
  if (!filePath) return false;
  if (await fileExists(filePath)) return false;

  const templatePath = kind === 'weekly'
    ? 'docs/templates/WEEKLY-REVIEW.md'
    : 'docs/templates/WEEKLY-BASELINE.md';
  const template = await readFile(templatePath, 'utf8');
  const content = applyTemplateValues(template, week, collectedAtTs, kind);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  return true;
}

async function updateWeeklyReviewFile(filePath, result, collectedAtTs) {
  const raw = await readFile(filePath, 'utf8');
  const kpiAcceptLine = `- 提案 Accept 率（7日）: ${toPercent(result.kpi.acceptRate.rate)}（accepted=${result.kpi.acceptRate.accepted}, dismissed=${result.kpi.acceptRate.dismissed}, snoozed=${result.kpi.acceptRate.snoozed}）`;
  const kpiActiveLine = `- 7日アクティブ率: ${toPercent(result.kpi.activeRate.rate)}（activeDays=${result.kpi.activeRate.activeDays}）`;
  const kpiRevisitLine = `- 通知経由再訪率（7日）: ${toPercent(result.kpi.revisitRate.rate)}（notificationShown=${result.kpi.revisitRate.shown}, notificationClicked=${result.kpi.revisitRate.clicked}, unmatchedClicks=${result.kpi.revisitRate.unmatchedClicks}）`;
  const kpiStatusLine = `- KPI 判定: Accept=${result.assessment.kpi.acceptRate}, Active=${result.assessment.kpi.activeRate}, Revisit=${result.assessment.kpi.revisitRate}, Overall=${result.assessment.kpi.overall}`;
  const sloHeartbeatLine = `- Heartbeat 実行成功率（24h平均）: ${toPercent(result.slo24h.heartbeatRunSuccess.rate)}（attempts=${result.slo24h.heartbeatRunSuccess.attempts}）`;
  const sloPushLine = `- Push wake 実行成功率（24h平均）: ${toPercent(result.slo24h.pushWakeSuccess.rate)}（attempts=${result.slo24h.pushWakeSuccess.attempts}）`;
  const sloLatencyLine = typeof result.slo24h.heartbeatDurationP95.p95Ms === 'number'
    ? `- Heartbeat 遅延 p95（24h平均）: ${(result.slo24h.heartbeatDurationP95.p95Ms / 1000).toFixed(2)}s（${result.slo24h.heartbeatDurationP95.p95Ms}ms, sampleSize=${result.slo24h.heartbeatDurationP95.sampleSize}）`
    : `- Heartbeat 遅延 p95（24h平均）: n/a（sampleSize=${result.slo24h.heartbeatDurationP95.sampleSize}）`;
  const sloStatusLine = `- SLO 判定: Heartbeat=${result.assessment.slo24h.heartbeatRunSuccess}, Push=${result.assessment.slo24h.pushWakeSuccess}, Latency=${result.assessment.slo24h.heartbeatDurationP95}, Overall=${result.assessment.slo24h.overall}`;
  const reviewDateLine = `レビュー日: ${localDate(collectedAtTs)}  `;

  let next = raw;
  next = lineReplace(next, /^- 提案 Accept 率（7日）:.*$/m, kpiAcceptLine);
  next = lineReplace(next, /^- 7日アクティブ率:.*$/m, kpiActiveLine);
  next = lineReplace(next, /^- 通知経由再訪率（7日）:.*$/m, kpiRevisitLine);
  next = lineReplace(next, /^- KPI 判定:.*$/m, kpiStatusLine);
  next = lineReplace(next, /^- Heartbeat 実行成功率（24h平均）:.*$/m, sloHeartbeatLine);
  next = lineReplace(next, /^- Push wake 実行成功率（24h平均）:.*$/m, sloPushLine);
  next = lineReplace(next, /^- Heartbeat 遅延 p95（24h平均）:.*$/m, sloLatencyLine);
  next = lineReplace(next, /^- SLO 判定:.*$/m, sloStatusLine);
  next = lineReplace(next, /^レビュー日:\s.*$/m, reviewDateLine);
  // 旧テンプレート由来の補助行を除去
  next = next.replace(/^  - (Accept|Active|Revisit|Overall):.*\n/gm, '');
  next = next.replace(/^  - (Heartbeat success|Push success|Latency|Overall):.*\n/gm, '');

  await writeFile(filePath, next);
}

async function updateBaselineFile(filePath, result, collectedAtTs, userDataDir) {
  const raw = await readFile(filePath, 'utf8');
  const runNote = userDataDir
    ? `自動再計測: 固定プロファイル \`${userDataDir}\``
    : '自動再計測: 一時プロファイル';
  const logLine = `  - ${localDateTimeMinute(collectedAtTs)} JST（${runNote}）`;
  const activeDaysLine = result.kpi.activeRate.days.length > 0
    ? result.kpi.activeRate.days.join(', ')
    : '(なし)';
  const latencyLine = typeof result.slo24h.heartbeatDurationP95.p95Ms === 'number'
    ? `- p95: ${(result.slo24h.heartbeatDurationP95.p95Ms / 1000).toFixed(2)}s（${result.slo24h.heartbeatDurationP95.p95Ms}ms, サンプル数 ${result.slo24h.heartbeatDurationP95.sampleSize}）`
    : `- p95: n/a（サンプル数 ${result.slo24h.heartbeatDurationP95.sampleSize}）`;

  let next = raw;
  next = appendExecutionDateLog(next, logLine);

  next = lineReplace(next, /^- accepted:.*$/m, `- accepted: ${result.kpi.acceptRate.accepted}`);
  next = lineReplace(next, /^- dismissed:.*$/m, `- dismissed: ${result.kpi.acceptRate.dismissed}`);
  next = lineReplace(next, /^- snoozed:.*$/m, `- snoozed: ${result.kpi.acceptRate.snoozed}`);
  next = lineReplace(next, /^- total:.*$/m, `- total: ${result.kpi.acceptRate.total}`);
  next = lineReplace(next, /^- acceptRate:.*$/m, `- acceptRate: ${toPercent(result.kpi.acceptRate.rate)} (${result.kpi.acceptRate.rate.toFixed(4)})`);
  next = lineReplace(next, /^- activeDays:.*$/m, `- activeDays: ${result.kpi.activeRate.activeDays}`);
  next = lineReplace(next, /^- activeRate:.*$/m, `- activeRate: ${toPercent(result.kpi.activeRate.rate)} (${result.kpi.activeRate.rate.toFixed(4)})`);
  next = lineReplace(next, /^- days:.*$/m, `- days: ${activeDaysLine}`);
  next = lineReplace(next, /^- notificationShown:.*$/m, `- notificationShown: ${result.kpi.revisitRate.shown}`);
  next = lineReplace(next, /^- notificationClicked:.*$/m, `- notificationClicked: ${result.kpi.revisitRate.clicked}`);
  next = lineReplace(next, /^- unmatchedClicks:.*$/m, `- unmatchedClicks: ${result.kpi.revisitRate.unmatchedClicks}`);
  next = lineReplace(next, /^- revisitRate:.*$/m, `- revisitRate: ${toPercent(result.kpi.revisitRate.rate)} (${result.kpi.revisitRate.rate.toFixed(4)})`);
  next = lineReplace(next, /^- shownByChannel:.*$/m, `- shownByChannel: ${JSON.stringify(result.kpi.revisitRate.shownByChannel)}`);
  next = lineReplace(next, /^- clickedByChannel:.*$/m, `- clickedByChannel: ${JSON.stringify(result.kpi.revisitRate.clickedByChannel)}`);
  next = lineReplace(next, /^- kpiAcceptStatus:.*$/m, `- kpiAcceptStatus: ${result.assessment.kpi.acceptRate}`);
  next = lineReplace(next, /^- kpiActiveStatus:.*$/m, `- kpiActiveStatus: ${result.assessment.kpi.activeRate}`);
  next = lineReplace(next, /^- kpiRevisitStatus:.*$/m, `- kpiRevisitStatus: ${result.assessment.kpi.revisitRate}`);
  next = lineReplace(next, /^- kpiOverallStatus:.*$/m, `- kpiOverallStatus: ${result.assessment.kpi.overall}`);

  next = replaceSection(next, '1) Heartbeat 実行成功率（24h）', (section) => {
    let updated = section;
    updated = lineReplace(updated, /^- 試行回数:.*$/m, `- 試行回数: ${result.slo24h.heartbeatRunSuccess.attempts}`);
    updated = lineReplace(updated, /^- 成功回数:.*$/m, `- 成功回数: ${result.slo24h.heartbeatRunSuccess.success}`);
    updated = lineReplace(updated, /^- 失敗回数:.*$/m, `- 失敗回数: ${result.slo24h.heartbeatRunSuccess.failure}`);
    updated = lineReplace(updated, /^- 成功率:.*$/m, `- 成功率: ${toPercent(result.slo24h.heartbeatRunSuccess.rate)} (${result.slo24h.heartbeatRunSuccess.rate.toFixed(4)})`);
    return updated;
  });

  next = replaceSection(next, '2) Push wake 実行成功率（24h）', (section) => {
    let updated = section;
    updated = lineReplace(updated, /^- 試行回数:.*$/m, `- 試行回数: ${result.slo24h.pushWakeSuccess.attempts}`);
    updated = lineReplace(updated, /^- 成功回数:.*$/m, `- 成功回数: ${result.slo24h.pushWakeSuccess.success}`);
    updated = lineReplace(updated, /^- 失敗回数:.*$/m, `- 失敗回数: ${result.slo24h.pushWakeSuccess.failure}`);
    updated = lineReplace(updated, /^- 成功率:.*$/m, `- 成功率: ${toPercent(result.slo24h.pushWakeSuccess.rate)} (${result.slo24h.pushWakeSuccess.rate.toFixed(4)})`);
    return updated;
  });

  next = replaceSection(next, '3) Heartbeat 遅延 p95（24h）', (section) => {
    let updated = section;
    updated = lineReplace(updated, /^- p95:.*$/m, latencyLine);
    updated = lineReplace(updated, /^- slo24hHeartbeatStatus:.*$/m, `- slo24hHeartbeatStatus: ${result.assessment.slo24h.heartbeatRunSuccess}`);
    updated = lineReplace(updated, /^- slo24hPushStatus:.*$/m, `- slo24hPushStatus: ${result.assessment.slo24h.pushWakeSuccess}`);
    updated = lineReplace(updated, /^- slo24hLatencyStatus:.*$/m, `- slo24hLatencyStatus: ${result.assessment.slo24h.heartbeatDurationP95}`);
    updated = lineReplace(updated, /^- slo24hOverallStatus:.*$/m, `- slo24hOverallStatus: ${result.assessment.slo24h.overall}`);
    return updated;
  });

  await writeFile(filePath, next);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  const outputPaths = resolveOutputPaths(opts);

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
        const recentResults = Array.isArray(heartbeatState?.recentResults) ? heartbeatState.recentResults : [];
        const conversations = await readAll('conversations');
        const opsEvents = await readOpsEvents();
        const MAX_RECENT_RESULTS = 50;

        const activeDays = new Set();

        for (const msg of conversations) {
          if (msg?.role === 'user' && typeof msg.timestamp === 'number' && msg.timestamp >= cutoff) {
            activeDays.add(new Date(msg.timestamp).toISOString().slice(0, 10));
          }
        }

        const kpiOpsEvents = Array.isArray(opsEvents)
          ? opsEvents.filter((e) => typeof e?.timestamp === 'number' && e.timestamp >= cutoff)
          : [];
        const feedbackOpsEvents = kpiOpsEvents.filter(
          (e) => e?.type === 'heartbeat-feedback'
            && (e?.feedbackType === 'accepted' || e?.feedbackType === 'dismissed' || e?.feedbackType === 'snoozed'),
        );
        const feedbackByResult = new Map();

        // heartbeat-feedback ops-event を優先して、結果単位（taskId + resultTimestamp）で最新状態を採用する
        for (const e of feedbackOpsEvents) {
          const taskId = typeof e?.taskId === 'string' ? e.taskId : '';
          const resultTimestamp = Number(e?.resultTimestamp);
          if (!taskId || !Number.isFinite(resultTimestamp) || resultTimestamp < cutoff) continue;
          const feedbackType = e.feedbackType;
          const key = `${taskId}:${resultTimestamp}`;
          const prev = feedbackByResult.get(key);
          if (!prev || e.timestamp >= prev.feedbackTimestamp) {
            feedbackByResult.set(key, {
              feedbackType,
              feedbackTimestamp: e.timestamp,
            });
          }
        }

        // recentResults は 50 件 cap のため、7日窓が cap を超えているときは補完に使わない
        let recentResultsLikelyCappedForWindow = false;
        if (recentResults.length >= MAX_RECENT_RESULTS) {
          let oldestRecentResultTs = Number.POSITIVE_INFINITY;
          for (const r of recentResults) {
            if (typeof r?.timestamp !== 'number') continue;
            if (r.timestamp < oldestRecentResultTs) oldestRecentResultTs = r.timestamp;
          }
          recentResultsLikelyCappedForWindow = (
            Number.isFinite(oldestRecentResultTs) && oldestRecentResultTs >= cutoff
          );
        }

        if (!recentResultsLikelyCappedForWindow) {
          for (const r of recentResults) {
            if (typeof r?.timestamp !== 'number' || r.timestamp < cutoff) continue;
            if (!r.feedback) continue;
            if (r.feedback.type !== 'accepted' && r.feedback.type !== 'dismissed' && r.feedback.type !== 'snoozed') {
              continue;
            }
            const key = `${r.taskId}:${r.timestamp}`;
            const feedbackTimestamp = typeof r.feedback.timestamp === 'number'
              ? r.feedback.timestamp
              : r.timestamp;
            const prev = feedbackByResult.get(key);
            if (!prev || feedbackTimestamp >= prev.feedbackTimestamp) {
              feedbackByResult.set(key, {
                feedbackType: r.feedback.type,
                feedbackTimestamp,
              });
            }
          }
        }

        let accepted = 0;
        let dismissed = 0;
        let snoozed = 0;
        for (const feedback of feedbackByResult.values()) {
          if (feedback.feedbackType === 'accepted') accepted++;
          if (feedback.feedbackType === 'dismissed') dismissed++;
          if (feedback.feedbackType === 'snoozed') snoozed++;
          if (feedback.feedbackTimestamp >= cutoff) {
            activeDays.add(new Date(feedback.feedbackTimestamp).toISOString().slice(0, 10));
          }
        }

        const feedbackTotal = accepted + dismissed + snoozed;
        const acceptRate = feedbackTotal > 0 ? accepted / feedbackTotal : 0;
        const activeRate = activeDays.size / days;
        const feedbackSource = feedbackOpsEvents.length > 0
          ? (recentResultsLikelyCappedForWindow ? 'ops-events' : 'ops-events+recent-results')
          : (recentResultsLikelyCappedForWindow ? 'ops-events' : 'recent-results');
        const feedbackCoverageInsufficient = recentResultsLikelyCappedForWindow && feedbackOpsEvents.length === 0;

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
              source: feedbackSource,
              coverageInsufficient: feedbackCoverageInsufficient,
              sampleCount: feedbackByResult.size,
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

    const assessment = {
      kpi: {
        acceptRate: result.kpi.acceptRate.coverageInsufficient
          ? 'NoData'
          : classifyHigherBetter(result.kpi.acceptRate.rate, { good: 0.5, watch: 0.35 }),
        activeRate: classifyHigherBetter(result.kpi.activeRate.rate, { good: 0.57, watch: 0.43 }),
        revisitRate: classifyHigherBetter(result.kpi.revisitRate.rate, { good: 0.2, watch: 0.1 }),
      },
      slo24h: {
        heartbeatRunSuccess: classifySloSuccessRate(
          result.slo24h.heartbeatRunSuccess.rate,
          result.slo24h.heartbeatRunSuccess.attempts,
          { target: 0.99, alert: 0.97 },
        ),
        pushWakeSuccess: classifySloSuccessRate(
          result.slo24h.pushWakeSuccess.rate,
          result.slo24h.pushWakeSuccess.attempts,
          { target: 0.95, alert: 0.9 },
        ),
        heartbeatDurationP95: classifySloLatencyMs(
          result.slo24h.heartbeatDurationP95.p95Ms,
          result.slo24h.heartbeatDurationP95.sampleSize,
          { targetMs: 30_000, alertMs: 45_000 },
        ),
      },
    };
    assessment.kpi.overall = worstStatus([
      assessment.kpi.acceptRate,
      assessment.kpi.activeRate,
      assessment.kpi.revisitRate,
    ]);
    assessment.slo24h.overall = worstStatus([
      assessment.slo24h.heartbeatRunSuccess,
      assessment.slo24h.pushWakeSuccess,
      assessment.slo24h.heartbeatDurationP95,
    ]);
    result.assessment = assessment;

    console.log('=== PoC KPI Snapshot ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n=== Markdown Paste Helper ===');
    console.log(`- accepted: ${result.kpi.acceptRate.accepted}`);
    console.log(`- dismissed: ${result.kpi.acceptRate.dismissed}`);
    console.log(`- snoozed: ${result.kpi.acceptRate.snoozed}`);
    console.log(`- total: ${result.kpi.acceptRate.total}`);
    console.log(`- acceptRate: ${toPercent(result.kpi.acceptRate.rate)} (${result.kpi.acceptRate.rate.toFixed(4)})`);
    console.log(`- acceptRateSource: ${result.kpi.acceptRate.source}`);
    console.log(`- acceptRateSamples: ${result.kpi.acceptRate.sampleCount}`);
    if (result.kpi.acceptRate.coverageInsufficient) {
      console.log('- warn: 7-day feedback data may be incomplete (recentResults is capped and no heartbeat-feedback ops-events were found)');
    }
    console.log(`- activeDays: ${result.kpi.activeRate.activeDays}`);
    console.log(`- activeRate: ${toPercent(result.kpi.activeRate.rate)} (${result.kpi.activeRate.rate.toFixed(4)})`);
    console.log(`- days: ${result.kpi.activeRate.days.join(', ')}`);
    console.log(`- notificationShown: ${result.kpi.revisitRate.shown}`);
    console.log(`- notificationClicked: ${result.kpi.revisitRate.clicked}`);
    console.log(`- unmatchedClicks: ${result.kpi.revisitRate.unmatchedClicks}`);
    console.log(`- revisitRate: ${toPercent(result.kpi.revisitRate.rate)} (${result.kpi.revisitRate.rate.toFixed(4)})`);
    console.log(`- kpiAcceptStatus: ${result.assessment.kpi.acceptRate}`);
    console.log(`- kpiActiveStatus: ${result.assessment.kpi.activeRate}`);
    console.log(`- kpiRevisitStatus: ${result.assessment.kpi.revisitRate}`);
    console.log(`- kpiOverallStatus: ${result.assessment.kpi.overall}`);
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
    console.log(`- slo24hHeartbeatStatus: ${result.assessment.slo24h.heartbeatRunSuccess}`);
    console.log(`- slo24hPushStatus: ${result.assessment.slo24h.pushWakeSuccess}`);
    console.log(`- slo24hLatencyStatus: ${result.assessment.slo24h.heartbeatDurationP95}`);
    console.log(`- slo24hOverallStatus: ${result.assessment.slo24h.overall}`);
    const now = Date.now();
    console.log(`- collectedAtLocal: ${localDateTime(now)}`);
    console.log(`- collectedAtUtcDate: ${isoDate(now)}`);

    const weeklyWeek = opts.week || inferWeekFromPath(outputPaths.weeklyReview);
    const baselineWeek = opts.week || inferWeekFromPath(outputPaths.baseline);
    if (outputPaths.weeklyReview) {
      const created = await ensureOutputFile(outputPaths.weeklyReview, 'weekly', weeklyWeek, now);
      if (created) {
        console.log(`- weeklyReviewCreated: ${outputPaths.weeklyReview}`);
      }
      await updateWeeklyReviewFile(outputPaths.weeklyReview, result, now);
      console.log(`- weeklyReviewUpdated: ${outputPaths.weeklyReview}`);
    }
    if (outputPaths.baseline) {
      const created = await ensureOutputFile(outputPaths.baseline, 'baseline', baselineWeek, now);
      if (created) {
        console.log(`- baselineCreated: ${outputPaths.baseline}`);
      }
      await updateBaselineFile(outputPaths.baseline, result, now, opts.userDataDir);
      console.log(`- baselineUpdated: ${outputPaths.baseline}`);
    }
    if (!opts.userDataDir) {
      console.log('- note: デフォルトは一時プロファイルで実行されるため、既存ブラウザの利用データは含まれません');
    }
    if (
      opts.failOnAction
      && (result.assessment.kpi.overall === 'Action' || result.assessment.slo24h.overall === 'Action')
    ) {
      console.error('- gate: fail-on-action triggered (overall status includes Action)');
      process.exitCode = 2;
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
