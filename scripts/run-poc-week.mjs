#!/usr/bin/env node

import { spawn } from 'node:child_process';

const DEFAULT_WEEKLY_DIR = 'docs/weekly';
const WEEK_RE = /^(\d{4})-W(\d{2})$/;

function printHelp() {
  console.log(`Usage: npm run poc:run-week -- --week <YYYY-W##> [options]

Options:
  --week <id>            Required. Target week id (e.g. 2026-W11)
  --url <url>            Metrics target URL (default: http://localhost:5173)
  --days <n>             Metrics window days (default: 7)
  --user-data-dir <dir>  Persistent Chromium profile for metrics
  --seed-sample          Seed fallback PoC sample before metrics collection
  --weekly-dir <dir>     Weekly docs dir (default: docs/weekly)
  --owner <name>         Weekly owner for init (default: iAgent チーム)
  --force-init           Overwrite week scaffold files on init
  --strict               Enable fail-on-action for metrics step
  --check                Run weekly readiness check at the end
  --check-strict         Run check with strict completeness validation
  --check-require-interviews
                         Run check requiring all interviews completed
  --check-as-of <date>   Evaluate final check as of YYYY-MM-DD
  --check-report-json <path>
                         Write weekly readiness check summary JSON to file
  --dry-run-validation   Preview validation section without writing file
  --skip-init            Skip week scaffold initialization
  --skip-metrics         Skip KPI/SLO collection and file update
  --skip-validation      Skip interview summary sync
  --help                 Show this help

Examples:
  npm run poc:run-week -- --week 2026-W11 --user-data-dir /tmp/iagent-metrics-profile
  npm run poc:run-week -- --week 2026-W11 --skip-metrics
`);
}

function parseArgs(argv) {
  const args = {
    week: '',
    url: 'http://localhost:5173',
    days: 7,
    userDataDir: '',
    seedSample: false,
    weeklyDir: DEFAULT_WEEKLY_DIR,
    owner: 'iAgent チーム',
    forceInit: false,
    strict: false,
    check: false,
    checkStrict: false,
    checkRequireInterviews: false,
    checkAsOf: '',
    checkReportJson: '',
    dryRunValidation: false,
    skipInit: false,
    skipMetrics: false,
    skipValidation: false,
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
    if (a === '--strict') {
      args.strict = true;
      continue;
    }
    if (a === '--check') {
      args.check = true;
      continue;
    }
    if (a === '--check-strict') {
      args.checkStrict = true;
      continue;
    }
    if (a === '--check-require-interviews') {
      args.checkRequireInterviews = true;
      continue;
    }
    if (a === '--check-as-of') {
      args.checkAsOf = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--check-report-json') {
      args.checkReportJson = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--dry-run-validation') {
      args.dryRunValidation = true;
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
    if (a === '--seed-sample') {
      args.seedSample = true;
      continue;
    }
    if (a === '--week') {
      args.week = argv[i + 1] ?? '';
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
    if (a === '--weekly-dir') {
      args.weeklyDir = argv[i + 1] ?? args.weeklyDir;
      i++;
      continue;
    }
    if (a === '--owner') {
      args.owner = argv[i + 1] ?? args.owner;
      i++;
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

async function runNodeScript(scriptPath, args, stepLabel) {
  await new Promise((resolve, reject) => {
    console.log(`\n=== ${stepLabel} ===`);
    console.log(`node ${scriptPath} ${args.join(' ')}`);
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(`${stepLabel} failed with exit code ${code ?? 'unknown'}`);
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

  const finalCheckRequested = (
    opts.check
    || opts.checkStrict
    || opts.checkRequireInterviews
    || Boolean(opts.checkAsOf)
    || Boolean(opts.checkReportJson)
  );

  if (opts.skipInit && opts.skipMetrics && opts.skipValidation && !finalCheckRequested) {
    throw new Error('All steps are skipped. Remove at least one --skip-* option.');
  }

  if (!opts.skipInit) {
    const initArgs = ['--week', opts.week, '--weekly-dir', opts.weeklyDir, '--owner', opts.owner];
    if (opts.forceInit) initArgs.push('--force');
    await runNodeScript('scripts/init-poc-week.mjs', initArgs, 'Step 1/3: Initialize weekly files');
  }

  if (!opts.skipMetrics) {
    const metricsArgs = ['--week', opts.week, '--url', opts.url, '--days', String(opts.days)];
    if (opts.userDataDir) {
      metricsArgs.push('--user-data-dir', opts.userDataDir);
    }
    if (opts.seedSample) {
      metricsArgs.push('--seed-sample');
    }
    if (opts.weeklyDir !== DEFAULT_WEEKLY_DIR) {
      metricsArgs.push(
        '--weekly-review',
        `${opts.weeklyDir}/${opts.week}.md`,
        '--baseline',
        `${opts.weeklyDir}/${opts.week}-baseline.md`,
      );
    }
    if (opts.strict) {
      metricsArgs.push('--fail-on-action');
    }
    await runNodeScript('scripts/collect-poc-metrics.mjs', metricsArgs, 'Step 2/3: Collect KPI/SLO');
  }

  if (!opts.skipValidation) {
    const validationArgs = ['--week', opts.week, '--weekly-dir', opts.weeklyDir];
    if (opts.dryRunValidation) {
      validationArgs.push('--dry-run');
    }
    await runNodeScript('scripts/sync-poc-validation.mjs', validationArgs, 'Step 3/3: Sync user validation');
  }

  if (finalCheckRequested) {
    const checkArgs = ['--week', opts.week, '--weekly-dir', opts.weeklyDir];
    if (opts.checkStrict) {
      checkArgs.push('--strict');
    }
    if (opts.checkRequireInterviews) {
      checkArgs.push('--require-interviews');
    }
    if (opts.checkAsOf) {
      checkArgs.push('--as-of', opts.checkAsOf);
    }
    if (opts.checkReportJson) {
      checkArgs.push('--report-json', opts.checkReportJson);
    }
    await runNodeScript('scripts/check-poc-week.mjs', checkArgs, 'Final Check: Weekly readiness');
  }

  console.log('\n[poc:run-week] Completed.');
}

main().catch((error) => {
  console.error('[poc:run-week] Failed:', error instanceof Error ? error.message : String(error));
  const exitCode = typeof error?.exitCode === 'number' ? error.exitCode : 1;
  process.exit(exitCode);
});
