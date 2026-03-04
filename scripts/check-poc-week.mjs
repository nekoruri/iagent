#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';

const DEFAULT_WEEKLY_DIR = 'docs/weekly';
const WEEK_RE = /^(\d{4})-W(\d{2})$/;

const PERSONAS = [
  { label: '情報収集型', suffix: 'info-collector' },
  { label: 'PM型', suffix: 'pm' },
  { label: '学習者型', suffix: 'learner' },
];

function printHelp() {
  console.log(`Usage: npm run poc:check-week -- --week <YYYY-W##> [options]

Options:
  --week <id>            Required. Target week id (e.g. 2026-W11)
  --weekly-dir <dir>     Weekly docs dir (default: docs/weekly)
  --strict               Enable strict completeness checks
  --require-interviews   Require all 3 interview notes to be completed
  --json                 Print machine-readable summary JSON
  --help                 Show this help

Examples:
  npm run poc:check-week -- --week 2026-W11
  npm run poc:check-week -- --week 2026-W11 --strict --require-interviews
`);
}

function parseArgs(argv) {
  const args = {
    week: '',
    weeklyDir: DEFAULT_WEEKLY_DIR,
    strict: false,
    requireInterviews: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
    if (a === '--strict') {
      args.strict = true;
      continue;
    }
    if (a === '--require-interviews') {
      args.requireInterviews = true;
      continue;
    }
    if (a === '--json') {
      args.json = true;
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

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function extractSection(content, marker) {
  const start = content.indexOf(marker);
  if (start < 0) return '';
  const next = content.indexOf('\n## ', start + marker.length);
  const end = next >= 0 ? next + 1 : content.length;
  return content.slice(start, end);
}

function extractLineByPrefix(content, prefix) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith(prefix)) continue;
    return line.slice(prefix.length).trim();
  }
  return '';
}

function extractBetween(content, startMarker, endMarker = '') {
  const start = content.indexOf(startMarker);
  if (start < 0) return '';
  const from = start + startMarker.length;
  if (!endMarker) {
    return content.slice(from);
  }
  const end = content.indexOf(endMarker, from);
  return end >= 0 ? content.slice(from, end) : content.slice(from);
}

function hasFilledBullet(content) {
  const bullets = content.match(/^- .+$/gm) ?? [];
  return bullets.some((line) => !/^-\s*$/.test(line.trim()));
}

function hasPlaceholder(value) {
  if (!value) return true;
  if (/^[-\s]+$/.test(value)) return true;
  if (value === 'Good / Watch / Action') return true;
  if (value === 'あり / なし') return true;
  return false;
}

function isInterviewCompleted(status) {
  return Boolean(status && !/(未実施|未入力|予定)/.test(status));
}

function pushIssue(store, severity, path, message) {
  store.push({ severity, path, message });
}

function checkWeeklyReview(content, weeklyPath, week, opts, issues) {
  const weekLine = extractLineByPrefix(content, '週:');
  if (weekLine && weekLine !== week) {
    pushIssue(issues, 'error', weeklyPath, `週IDが一致しません（expected=${week}, actual=${weekLine}）`);
  }

  const requiredPrefixes = [
    '- 提案 Accept 率（7日）:',
    '- 7日アクティブ率:',
    '- 通知経由再訪率（7日）:',
    '- KPI 判定:',
    '- Heartbeat 実行成功率（24h平均）:',
    '- Push wake 実行成功率（24h平均）:',
    '- Heartbeat 遅延 p95（24h平均）:',
    '- SLO 判定:',
  ];
  for (const prefix of requiredPrefixes) {
    const value = extractLineByPrefix(content, prefix);
    if (!value) {
      pushIssue(issues, opts.strict ? 'error' : 'warn', weeklyPath, `必須行が未入力です: ${prefix}`);
      continue;
    }
    if (opts.strict && hasPlaceholder(value)) {
      pushIssue(issues, 'error', weeklyPath, `厳格チェックで未確定値です: ${prefix} ${value}`);
    }
  }

  const validationPrefixes = [
    '- 情報収集型:',
    '- PM型:',
    '- 学習者型:',
  ];
  for (const prefix of validationPrefixes) {
    const value = extractLineByPrefix(content, prefix);
    if (!value) {
      pushIssue(issues, opts.strict ? 'error' : 'warn', weeklyPath, `ユーザー検証の実施人数が未入力です: ${prefix}`);
      continue;
    }
    if (opts.strict && value.includes('未実施')) {
      pushIssue(issues, 'warn', weeklyPath, `未実施のペルソナがあります: ${prefix} ${value}`);
    }
  }

  const actionSection = extractSection(content, '## 4. 次週アクション');
  if (!actionSection) {
    pushIssue(issues, 'error', weeklyPath, '次週アクションセクションが見つかりません');
    return;
  }

  const actionLines = ['1.', '2.', '3.'].map((n) => extractLineByPrefix(actionSection, `${n}`));
  actionLines.forEach((value, idx) => {
    if (!value) {
      pushIssue(issues, opts.strict ? 'error' : 'warn', weeklyPath, `次週アクション ${idx + 1} が未入力です`);
    }
  });

  const ownerSection = extractBetween(actionSection, 'オーナー:', '期限:');
  const deadlineSection = extractBetween(actionSection, '期限:');
  const ownerFilled = hasFilledBullet(ownerSection);
  const deadlineFilled = hasFilledBullet(deadlineSection);

  if (!ownerFilled) {
    pushIssue(issues, opts.strict ? 'error' : 'warn', weeklyPath, 'オーナーが未入力です');
  }
  if (!deadlineFilled) {
    pushIssue(issues, opts.strict ? 'error' : 'warn', weeklyPath, '期限が未入力です');
  }
}

function checkBaseline(content, baselinePath, opts, issues) {
  const runDateSection = extractSection(content, '実施ログ');
  const runLogLines = runDateSection.match(/^  - .+$/gm) ?? [];
  if (runLogLines.length === 0) {
    pushIssue(issues, opts.strict ? 'error' : 'warn', baselinePath, '実施ログ（- 実施日）の履歴がありません');
  }

  const requiredPrefixes = [
    '- acceptRate:',
    '- activeRate:',
    '- revisitRate:',
    '- kpiOverallStatus:',
    '- slo24hOverallStatus:',
  ];
  for (const prefix of requiredPrefixes) {
    const value = extractLineByPrefix(content, prefix);
    if (!value) {
      pushIssue(issues, opts.strict ? 'error' : 'warn', baselinePath, `baseline必須行が未入力です: ${prefix}`);
    }
  }
}

function checkInterviews(interviews, opts, issues) {
  for (const interview of interviews) {
    const status = extractLineByPrefix(interview.content, 'ステータス:');
    const completed = isInterviewCompleted(status);
    if (!status) {
      pushIssue(issues, 'warn', interview.path, 'ステータスが未入力です');
      continue;
    }
    if (!completed) {
      const severity = opts.requireInterviews ? 'error' : 'warn';
      pushIssue(issues, severity, interview.path, `インタビュー未完了です（ステータス=${status}）`);
    }
  }
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

  const weeklyPath = `${opts.weeklyDir}/${opts.week}.md`;
  const baselinePath = `${opts.weeklyDir}/${opts.week}-baseline.md`;
  const planPath = `${opts.weeklyDir}/${opts.week}-interview-plan.md`;
  const interviews = PERSONAS.map((p) => ({
    persona: p.label,
    path: `${opts.weeklyDir}/interviews/${opts.week}-${p.suffix}.md`,
    content: '',
  }));

  const issues = [];
  const fileStatuses = [];

  for (const path of [weeklyPath, baselinePath, planPath, ...interviews.map((i) => i.path)]) {
    const exists = await fileExists(path);
    fileStatuses.push({ path, exists });
    if (!exists) {
      pushIssue(issues, 'error', path, 'ファイルが存在しません');
    }
  }

  const weeklyRaw = await fileExists(weeklyPath) ? await readFile(weeklyPath, 'utf8') : '';
  const baselineRaw = await fileExists(baselinePath) ? await readFile(baselinePath, 'utf8') : '';
  for (const interview of interviews) {
    if (await fileExists(interview.path)) {
      interview.content = await readFile(interview.path, 'utf8');
    }
  }

  if (weeklyRaw) {
    checkWeeklyReview(weeklyRaw, weeklyPath, opts.week, opts, issues);
  }
  if (baselineRaw) {
    checkBaseline(baselineRaw, baselinePath, opts, issues);
  }
  checkInterviews(interviews.filter((i) => i.content), opts, issues);

  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  const summary = {
    week: opts.week,
    weeklyDir: opts.weeklyDir,
    strict: opts.strict,
    requireInterviews: opts.requireInterviews,
    files: fileStatuses,
    counts: {
      errors: errors.length,
      warnings: warns.length,
    },
    issues,
    ok: errors.length === 0,
  };

  console.log('=== PoC Week Check ===');
  console.log(`- week: ${summary.week}`);
  console.log(`- strict: ${summary.strict ? 'on' : 'off'}`);
  console.log(`- requireInterviews: ${summary.requireInterviews ? 'on' : 'off'}`);
  console.log(`- errors: ${summary.counts.errors}`);
  console.log(`- warnings: ${summary.counts.warnings}`);

  for (const issue of issues) {
    const tag = issue.severity === 'error' ? 'ERROR' : 'WARN';
    console.log(`- [${tag}] ${issue.path}: ${issue.message}`);
  }

  if (opts.json) {
    console.log('\n=== JSON ===');
    console.log(JSON.stringify(summary, null, 2));
  }

  if (!summary.ok) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error('[poc:check-week] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
