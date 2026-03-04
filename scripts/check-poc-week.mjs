#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_WEEKLY_DIR = 'docs/weekly';
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INTERVIEW_PLACEHOLDER_VALUES = new Set([
  '多い / 少ない / 適切',
  '悪い / 普通 / 良い',
  'ある / ない',
]);

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
  --as-of <YYYY-MM-DD>   Evaluate interview due-date checks as of this date (default: JST today)
  --json                 Print machine-readable summary JSON
  --report-json <path>   Write machine-readable summary JSON to file
  --help                 Show this help

Examples:
  npm run poc:check-week -- --week 2026-W11
  npm run poc:check-week -- --week 2026-W11 --strict --require-interviews
  npm run poc:check-week -- --week 2026-W11 --strict --require-interviews --as-of 2026-03-15
  npm run poc:check-week -- --week 2026-W11 --report-json /tmp/poc-week-check.json
`);
}

function parseArgs(argv) {
  const args = {
    week: '',
    weeklyDir: DEFAULT_WEEKLY_DIR,
    strict: false,
    requireInterviews: false,
    asOf: '',
    json: false,
    reportJson: '',
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
    if (a === '--as-of') {
      args.asOf = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--json') {
      args.json = true;
      continue;
    }
    if (a === '--report-json') {
      args.reportJson = argv[i + 1] ?? '';
      i++;
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

function normalizeInterviewValue(raw) {
  const value = raw.trim();
  if (!value) return '';
  if (/^[-\s]+$/.test(value)) return '';
  if (INTERVIEW_PLACEHOLDER_VALUES.has(value)) return '';
  return value;
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

function checkInterviews(interviews, opts, issues, asOfDate) {
  for (const interview of interviews) {
    const status = extractLineByPrefix(interview.content, 'ステータス:');
    const scheduledDate = extractLineByPrefix(interview.content, '実施予定日:');
    const completed = isInterviewCompleted(status);
    if (!status) {
      pushIssue(issues, 'warn', interview.path, 'ステータスが未入力です');
      continue;
    }
    if (!completed) {
      if (!opts.requireInterviews) {
        pushIssue(issues, 'warn', interview.path, `インタビュー未完了です（ステータス=${status}）`);
        continue;
      }
      if (scheduledDate && DATE_RE.test(scheduledDate) && scheduledDate > asOfDate) {
        pushIssue(
          issues,
          'warn',
          interview.path,
          `インタビュー未完了だが予定日未到来です（ステータス=${status}, 予定日=${scheduledDate}, asOf=${asOfDate}）`,
        );
        continue;
      }
      pushIssue(issues, 'error', interview.path, `インタビュー未完了です（ステータス=${status}）`);
      continue;
    }

    if (completed) {
      const positiveSection = extractSection(interview.content, '## 2. よかった提案（価値が高かったもの）');
      const negativeSection = extractSection(interview.content, '## 3. 不要だった提案（ノイズ）');
      const notifySection = extractSection(interview.content, '## 4. 通知評価');
      const requestSection = extractSection(interview.content, '## 6. 次週の改善要求');
      const requiredFields = [
        {
          label: 'よかった提案（提案内容）',
          value: normalizeInterviewValue(extractLineByPrefix(positiveSection, '- 提案内容:')),
        },
        {
          label: 'よかった提案（価値理由）',
          value: normalizeInterviewValue(extractLineByPrefix(positiveSection, '- なぜ価値があったか:')),
        },
        {
          label: '不要提案（提案内容）',
          value: normalizeInterviewValue(extractLineByPrefix(negativeSection, '- 提案内容:')),
        },
        {
          label: '不要提案（不要理由）',
          value: normalizeInterviewValue(extractLineByPrefix(negativeSection, '- なぜ不要だったか:')),
        },
        {
          label: '通知評価（頻度）',
          value: normalizeInterviewValue(extractLineByPrefix(notifySection, '- 頻度:')),
        },
        {
          label: '通知評価（タイミング）',
          value: normalizeInterviewValue(extractLineByPrefix(notifySection, '- タイミング:')),
        },
        {
          label: '通知評価（体験コメント）',
          value: normalizeInterviewValue(extractLineByPrefix(notifySection, '- 体験コメント:')),
        },
        {
          label: '次週改善要求（Must）',
          value: normalizeInterviewValue(extractLineByPrefix(requestSection, '- Must:')),
        },
      ];

      for (const field of requiredFields) {
        if (field.value) continue;
        pushIssue(
          issues,
          opts.strict ? 'error' : 'warn',
          interview.path,
          `実施済みだが必須項目が未入力です: ${field.label}`,
        );
      }
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
  const asOfDate = opts.asOf || todayJstDate();
  assertDate(asOfDate, '--as-of');

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
  checkInterviews(interviews.filter((i) => i.content), opts, issues, asOfDate);

  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  const summary = {
    week: opts.week,
    weeklyDir: opts.weeklyDir,
    strict: opts.strict,
    requireInterviews: opts.requireInterviews,
    asOfDate,
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
  console.log(`- asOfDate: ${summary.asOfDate}`);
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
  if (opts.reportJson) {
    await mkdir(dirname(opts.reportJson), { recursive: true });
    await writeFile(opts.reportJson, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`- reportJsonWritten: ${opts.reportJson}`);
  }

  if (!summary.ok) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error('[poc:check-week] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
