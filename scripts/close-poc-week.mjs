#!/usr/bin/env node

import { spawn } from 'node:child_process';

const DEFAULT_WEEKLY_DIR = 'docs/weekly';
const DEFAULT_URL = 'http://localhost:5173';
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function printHelp() {
  console.log(`Usage: npm run poc:close-week -- --week <YYYY-W##> [options]

Options:
  --week <id>            Required. Target week id (e.g. 2026-W11)
  --weekly-dir <dir>     Weekly docs dir (default: docs/weekly)
  --url <url>            Metrics target URL (default: http://localhost:5173)
  --days <n>             Metrics window days (default: 7)
  --user-data-dir <dir>  Persistent Chromium profile for metrics
  --seed-sample          Seed fallback PoC sample before metrics collection
  --owner <name>         Weekly owner for init
  --force-init           Overwrite week scaffold files on init
  --skip-init            Skip week scaffold initialization
  --skip-metrics         Skip KPI/SLO collection
  --skip-validation      Skip interview summary sync
  --as-of <YYYY-MM-DD>   As-of date for strict interview due checks (default: JST today)
  --report-json <path>   Output path for strict check report JSON
  --help                 Show this help

Examples:
  npm run poc:close-week -- --week 2026-W11 --user-data-dir /tmp/iagent-metrics-profile
  npm run poc:close-week -- --week 2026-W11 --as-of 2026-03-14
`);
}

function parseArgs(argv) {
  const args = {
    week: '',
    weeklyDir: DEFAULT_WEEKLY_DIR,
    url: DEFAULT_URL,
    days: 7,
    userDataDir: '',
    seedSample: false,
    owner: '',
    forceInit: false,
    skipInit: false,
    skipMetrics: false,
    skipValidation: false,
    asOf: '',
    reportJson: '',
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
    if (a === '--force-init') {
      args.forceInit = true;
      continue;
    }
    if (a === '--skip-init') {
      args.skipInit = true;
      continue;
    }
    if (a === '--skip-metrics') {
      args.skipMetrics = true;
      continue;
    }
    if (a === '--skip-validation') {
      args.skipValidation = true;
      continue;
    }
    if (a === '--week') {
      args.week = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--weekly-dir') {
      args.weeklyDir = argv[i + 1] ?? args.weeklyDir;
      i++;
      continue;
    }
    if (a === '--url') {
      args.url = argv[i + 1] ?? args.url;
      i++;
      continue;
    }
    if (a === '--days') {
      const raw = Number(argv[i + 1]);
      if (Number.isFinite(raw) && raw > 0) args.days = Math.floor(raw);
      i++;
      continue;
    }
    if (a === '--user-data-dir') {
      args.userDataDir = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--owner') {
      args.owner = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--as-of') {
      args.asOf = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--report-json') {
      args.reportJson = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--seed-sample') {
      args.seedSample = true;
      continue;
    }
  }

  return args;
}

function assertWeek(week) {
  const match = week.match(WEEK_RE);
  if (!match) {
    throw new Error(`Invalid --week format: ${week} (expected YYYY-W##)`);
  }
  const weekNum = Number(match[2]);
  if (weekNum < 1 || weekNum > 53) {
    throw new Error(`Invalid week number: ${weekNum} (expected 01-53)`);
  }
}

function todayJstDate() {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(new Date()).replaceAll('/', '-');
}

function assertDate(value, label) {
  if (!DATE_RE.test(value)) {
    throw new Error(`Invalid ${label} format: ${value} (expected YYYY-MM-DD)`);
  }
}

async function runCloseWeek(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/run-poc-week.mjs', ...args], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(`[poc:close-week] run-week failed with exit code ${code ?? 'unknown'}`);
      error.exitCode = typeof code === 'number' ? code : 1;
      reject(error);
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  if (!opts.week) {
    throw new Error('--week is required');
  }
  assertWeek(opts.week);

  const asOf = opts.asOf || todayJstDate();
  assertDate(asOf, '--as-of');

  const reportJson = opts.reportJson || `${opts.weeklyDir}/${opts.week}-check-strict-${asOf}.json`;
  const runWeekArgs = [
    '--week',
    opts.week,
    '--weekly-dir',
    opts.weeklyDir,
    '--url',
    opts.url,
    '--days',
    String(opts.days),
    '--strict',
    '--check',
    '--check-strict',
    '--check-require-interviews',
    '--check-as-of',
    asOf,
    '--check-report-json',
    reportJson,
  ];

  if (opts.userDataDir) {
    runWeekArgs.push('--user-data-dir', opts.userDataDir);
  }
  if (opts.seedSample) {
    runWeekArgs.push('--seed-sample');
  }
  if (opts.owner) {
    runWeekArgs.push('--owner', opts.owner);
  }
  if (opts.forceInit) {
    runWeekArgs.push('--force-init');
  }
  if (opts.skipInit) {
    runWeekArgs.push('--skip-init');
  }
  if (opts.skipMetrics) {
    runWeekArgs.push('--skip-metrics');
  }
  if (opts.skipValidation) {
    runWeekArgs.push('--skip-validation');
  }

  console.log(`[poc:close-week] asOfDate=${asOf}`);
  console.log(`[poc:close-week] reportJson=${reportJson}`);
  await runCloseWeek(runWeekArgs);
}

main().catch((error) => {
  console.error('[poc:close-week] Failed:', error instanceof Error ? error.message : String(error));
  const exitCode = typeof error?.exitCode === 'number' ? error.exitCode : 1;
  process.exit(exitCode);
});
