#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_WEEKLY_DIR = 'docs/weekly';
const WEEK_RE = /^(\d{4})-W(\d{2})$/;

function printHelp() {
  console.log(`Usage: npm run poc:init-week -- --week <YYYY-W##> [options]

Options:
  --week <id>         Required. Target week id (e.g. 2026-W11)
  --owner <name>      Weekly review owner (default: iAgent チーム)
  --weekly-dir <dir>  Weekly docs dir (default: docs/weekly)
  --force             Overwrite files if already exist
  --help              Show this help

Examples:
  npm run poc:init-week -- --week 2026-W11
  npm run poc:init-week -- --week 2026-W11 --owner "iAgent Team" --force
`);
}

function parseArgs(argv) {
  const args = {
    week: '',
    owner: 'iAgent チーム',
    weeklyDir: DEFAULT_WEEKLY_DIR,
    force: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
    if (a === '--force') {
      args.force = true;
      continue;
    }
    if (a === '--week') {
      args.week = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--owner') {
      args.owner = argv[i + 1] ?? args.owner;
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
  const m = week.match(WEEK_RE);
  if (!m) {
    throw new Error(`Invalid --week format: ${week} (expected YYYY-W##)`);
  }
  const weekNum = Number(m[2]);
  if (weekNum < 1 || weekNum > 53) {
    throw new Error(`Invalid week number: ${weekNum} (expected 01-53)`);
  }
  return { year: Number(m[1]), week: weekNum };
}

function formatDateYYYYMMDD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoWeekDate(weekId, isoWeekday) {
  const { year, week } = assertWeek(weekId);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const target = new Date(mondayWeek1);
  target.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7 + (isoWeekday - 1));
  return formatDateYYYYMMDD(target);
}

function todayJst() {
  const now = new Date();
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(now).replaceAll('/', '-');
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeGeneratedFile(path, content, force) {
  const exists = await fileExists(path);
  if (exists && !force) {
    console.log(`- skipped: ${path} (already exists)`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  console.log(`- written: ${path}${exists ? ' (overwritten)' : ''}`);
}

function applyWeeklyReviewTemplate(template, week, owner, createdDate) {
  let out = template;
  out = out.replace(/^# PoC 週次レビュー テンプレート$/m, `# PoC 週次レビュー: ${week}`);
  out = out.replace(/^週:\s*YYYY-W##/m, `週: ${week}`);
  out = out.replace(/^レビュー日:\s*YYYY-MM-DD/m, `レビュー日: ${createdDate}`);
  out = out.replace(/^担当:\s*$/m, `担当: ${owner}`);
  return out;
}

function applyBaselineTemplate(template, week, createdDate) {
  return template
    .replaceAll('YYYY-W##', week)
    .replaceAll('YYYY-MM-DD', createdDate);
}

function buildInterviewPlan(week, createdDate, dates) {
  return `# ${week} インタビュー実施計画

作成日: ${createdDate}  
目的: 3 ペルソナそれぞれの「助かる提案 / 邪魔な提案」を1週間で収集する。

---

## 対象

1. 情報収集型（大量情報の圧縮ニーズ）
2. PM型（リマインドと漏れ防止ニーズ）
3. 学習者型（継続支援ニーズ）

---

## 実施スケジュール

1. ${dates.info}: 情報収集型インタビュー
2. ${dates.pm}: PM型インタビュー
3. ${dates.learner}: 学習者型インタビュー
4. ${dates.analysis}: 横断分析

---

## 収集フォーマット

- 記録テンプレート: \`docs/templates/USER-INTERVIEW-NOTE.md\`
- 1 人あたり所要時間: 30 分
- 記録必須項目:
  - 助かった提案 1 件以上
  - 不要だった提案 1 件以上
  - 通知頻度評価
  - 次週の改善要求

---

## 成果物

1. インタビュー記録 3 件
2. 週次レビュー反映（\`docs/weekly/${week}.md\`）
3. 改善タスク起票（最大 3 件）

---

## 完了条件

- 3 ペルソナすべてのインタビュー記録が揃う
- 共通ポジティブ / 共通ネガティブが週次レビューに反映される
- 次週の改善タスクにオーナーと期限が設定される
`;
}

function extractInterviewBody(template) {
  const match = template.match(/## 1\. 今週の利用状況[\s\S]*$/);
  if (match) return match[0].trimEnd();
  return `## 1. 今週の利用状況

- 利用日数:
- 主な利用シーン:
- 利用デバイス:
`;
}

function buildInterviewNote(week, persona, scheduledDate, body) {
  const weekLabel = week.split('-')[1] ?? week;
  return `# ユーザーインタビュー記録（${persona}）- ${week}

作成日: YYYY-MM-DD  
記入者:  
対象ユーザー:  
想定ペルソナ: ${persona}
実施予定日: ${scheduledDate}
ステータス: 未実施

---

## 実施チェック

- [ ] インタビュー実施
- [ ] 記録項目を全入力
- [ ] ${weekLabel} 週次レビューへ反映

---

${body}
`;
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

  const createdDate = todayJst();
  const dates = {
    info: isoWeekDate(opts.week, 2),     // Tue
    pm: isoWeekDate(opts.week, 4),       // Thu
    learner: isoWeekDate(opts.week, 5),  // Fri
    analysis: isoWeekDate(opts.week, 6), // Sat
  };

  const weeklyReviewPath = `${opts.weeklyDir}/${opts.week}.md`;
  const baselinePath = `${opts.weeklyDir}/${opts.week}-baseline.md`;
  const interviewPlanPath = `${opts.weeklyDir}/${opts.week}-interview-plan.md`;
  const interviewsDir = `${opts.weeklyDir}/interviews`;
  const infoPath = `${interviewsDir}/${opts.week}-info-collector.md`;
  const pmPath = `${interviewsDir}/${opts.week}-pm.md`;
  const learnerPath = `${interviewsDir}/${opts.week}-learner.md`;

  const weeklyTemplate = await readFile('docs/templates/WEEKLY-REVIEW.md', 'utf8');
  const baselineTemplate = await readFile('docs/templates/WEEKLY-BASELINE.md', 'utf8');
  const interviewTemplate = await readFile('docs/templates/USER-INTERVIEW-NOTE.md', 'utf8');
  const interviewBody = extractInterviewBody(interviewTemplate);

  await writeGeneratedFile(
    weeklyReviewPath,
    applyWeeklyReviewTemplate(weeklyTemplate, opts.week, opts.owner, createdDate),
    opts.force,
  );
  await writeGeneratedFile(
    baselinePath,
    applyBaselineTemplate(baselineTemplate, opts.week, createdDate),
    opts.force,
  );
  await writeGeneratedFile(
    interviewPlanPath,
    buildInterviewPlan(opts.week, createdDate, dates),
    opts.force,
  );
  await writeGeneratedFile(
    infoPath,
    buildInterviewNote(opts.week, '情報収集型', dates.info, interviewBody),
    opts.force,
  );
  await writeGeneratedFile(
    pmPath,
    buildInterviewNote(opts.week, 'PM型', dates.pm, interviewBody),
    opts.force,
  );
  await writeGeneratedFile(
    learnerPath,
    buildInterviewNote(opts.week, '学習者型', dates.learner, interviewBody),
    opts.force,
  );
}

main().catch((error) => {
  console.error('[poc:init-week] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
