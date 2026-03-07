#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

const DEFAULT_WEEKLY_DIR = 'docs/weekly';
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const PLACEHOLDER_TEXT = new Set([
  '-',
  '多い / 少ない / 適切',
  '悪い / 普通 / 良い',
  'ある / ない',
  '情報収集型 / PM型 / 学習者型',
]);
const PERSONAS = [
  { label: '情報収集型', suffix: 'info-collector' },
  { label: 'PM型', suffix: 'pm' },
  { label: '学習者型', suffix: 'learner' },
];

function printHelp() {
  console.log(`Usage: npm run poc:sync-validation -- --week <YYYY-W##> [options]

Options:
  --week <id>          Required. Target week id (e.g. 2026-W11)
  --weekly-dir <dir>   Weekly docs dir (default: docs/weekly)
  --weekly-review <p>  Weekly review markdown path (default: <weekly-dir>/<week>.md)
  --interviews-dir <d> Interview notes dir (default: <weekly-dir>/interviews)
  --dry-run            Print generated section without writing file
  --help               Show this help

Examples:
  npm run poc:sync-validation -- --week 2026-W11
  npm run poc:sync-validation -- --week 2026-W11 --dry-run
`);
}

function parseArgs(argv) {
  const args = {
    week: '',
    weeklyDir: DEFAULT_WEEKLY_DIR,
    weeklyReview: '',
    interviewsDir: '',
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
    if (a === '--dry-run') {
      args.dryRun = true;
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
    if (a === '--weekly-review') {
      args.weeklyReview = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (a === '--interviews-dir') {
      args.interviewsDir = argv[i + 1] ?? '';
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

function extractSection(content, heading) {
  const marker = `## ${heading}`;
  const start = content.indexOf(marker);
  if (start < 0) return '';
  const next = content.indexOf('\n## ', start + marker.length);
  const end = next >= 0 ? next + 1 : content.length;
  return content.slice(start, end);
}

function extractSubsection(content, heading) {
  const marker = heading;
  const start = content.indexOf(marker);
  if (start < 0) return '';
  const nextSub = content.indexOf('\n### ', start + marker.length);
  const nextSec = content.indexOf('\n## ', start + marker.length);
  const nextCandidates = [nextSub, nextSec].filter((value) => value >= 0);
  const end = nextCandidates.length > 0 ? Math.min(...nextCandidates) + 1 : content.length;
  return content.slice(start, end);
}

function extractField(content, prefix) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith(prefix)) continue;
    return line.slice(prefix.length).trim();
  }
  return '';
}

function extractStatus(content) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith('ステータス:')) continue;
    return line.slice('ステータス:'.length).trim();
  }
  return '';
}

function normalizeValue(raw) {
  const value = raw.trim();
  if (!value) return '';
  if (PLACEHOLDER_TEXT.has(value)) return '';
  if (/^[-\s]+$/.test(value)) return '';
  return value;
}

function isCompletedInterview(entry) {
  const statusDone = entry.status && !/(未実施|未入力|予定)/.test(entry.status);
  const answered = [
    entry.positiveProposal,
    entry.negativeProposal,
    entry.frequency,
    entry.comment,
    entry.must,
  ].some(Boolean);
  return Boolean(statusDone || answered);
}

function parseInterview(content, persona) {
  const positive = extractSection(content, '2. よかった提案（価値が高かったもの）');
  const negative = extractSection(content, '3. 不要だった提案（ノイズ）');
  const notify = extractSection(content, '4. 通知評価');
  const compare = extractSection(content, '5. 前週比');
  const request = extractSection(content, '6. 次週の改善要求');

  const entry = {
    persona,
    status: normalizeValue(extractStatus(content)),
    positiveProposal: normalizeValue(extractField(positive, '- 提案内容:')),
    positiveReason: normalizeValue(extractField(positive, '- なぜ価値があったか:')),
    negativeProposal: normalizeValue(extractField(negative, '- 提案内容:')),
    negativeReason: normalizeValue(extractField(negative, '- なぜ不要だったか:')),
    frequency: normalizeValue(extractField(notify, '- 頻度:')),
    timing: normalizeValue(extractField(notify, '- タイミング:')),
    comment: normalizeValue(extractField(notify, '- 体験コメント:')),
    smarterFeeling: normalizeValue(extractField(compare, '- 賢くなった実感:')),
    must: normalizeValue(extractField(request, '- Must:')),
    should: normalizeValue(extractField(request, '- Should:')),
    niceToHave: normalizeValue(extractField(request, '- Nice to have:')),
  };
  entry.completed = isCompletedInterview(entry);
  return entry;
}

function buildPersonaCountLine(entry) {
  return entry.completed ? '1（実施済）' : '0（未実施）';
}

function toLines(items, emptyLabel) {
  if (items.length === 0) return `- ${emptyLabel}`;
  return items.map((item) => `- ${item}`).join('\n');
}

function summarizeCounts(values) {
  if (values.length === 0) return '';
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => `${label}=${count}`)
    .join(', ');
}

function buildLearnedLine(entries) {
  const completed = entries.filter((e) => e.completed);
  const frequencySummary = summarizeCounts(completed.map((e) => e.frequency).filter(Boolean));
  if (!frequencySummary) return '通知頻度評価は未入力。';
  return `通知頻度評価: ${frequencySummary}`;
}

function buildRequestLine(entries) {
  const completed = entries.filter((e) => e.completed);
  const mustItems = completed.filter((e) => e.must).map((e) => `[${e.persona}] ${e.must}`);
  if (mustItems.length > 0) return `Must改善要求: ${mustItems.join(' / ')}`;

  const shouldItems = completed.filter((e) => e.should).map((e) => `[${e.persona}] ${e.should}`);
  if (shouldItems.length > 0) return `Should改善要求: ${shouldItems.join(' / ')}`;

  return '改善要求は未入力。';
}

function buildValidationSection(entries, preservedScenarioSection = '') {
  const byPersona = new Map(entries.map((entry) => [entry.persona, entry]));
  const completed = entries.filter((e) => e.completed);
  const positives = completed
    .filter((e) => e.positiveProposal)
    .map((e) => `[${e.persona}] ${e.positiveProposal}${e.positiveReason ? `（${e.positiveReason}）` : ''}`);
  const negatives = completed
    .filter((e) => e.negativeProposal)
    .map((e) => `[${e.persona}] ${e.negativeProposal}${e.negativeReason ? `（${e.negativeReason}）` : ''}`);

  const learn1 = `${completed.length}/${entries.length} 件のインタビューを実施。`;
  const learn2 = buildLearnedLine(entries);
  const learn3 = buildRequestLine(entries);

  const scenarioSection = preservedScenarioSection.trim()
    ? `\n${preservedScenarioSection.trimEnd()}\n`
    : `
### シナリオ評価

- 完了シナリオ数:
- 実施シナリオ:
- 成立:
- 微妙:
- 非成立:
- 主要シナリオ学び:
  1. 
  2. 
  3. 
`;

  return `## 2. ユーザー検証（項目 2）

実施人数:

- 情報収集型: ${buildPersonaCountLine(byPersona.get('情報収集型'))}
- PM型: ${buildPersonaCountLine(byPersona.get('PM型'))}
- 学習者型: ${buildPersonaCountLine(byPersona.get('学習者型'))}

共通ポジティブ:

${toLines(positives, '未収集')}

共通ネガティブ:

${toLines(negatives, '未収集')}

今週の主要学び（最大3件）:

1. ${learn1}
2. ${learn2}
3. ${learn3}
${scenarioSection}

---
`;
}

function replaceValidationSection(content, sectionText) {
  const marker = '## 2. ユーザー検証（項目 2）';
  const start = content.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not find section: ${marker}`);
  }
  const next = content.indexOf('\n## ', start + marker.length);
  const end = next >= 0 ? next + 1 : content.length;

  const before = content.slice(0, start);
  const after = content.slice(end).replace(/^\n+/, '');
  return `${before}${sectionText.trimEnd()}\n\n${after}`;
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

  const weeklyReviewPath = opts.weeklyReview || `${opts.weeklyDir}/${opts.week}.md`;
  const interviewsDir = opts.interviewsDir || `${opts.weeklyDir}/interviews`;

  const interviews = [];
  for (const persona of PERSONAS) {
    const path = `${interviewsDir}/${opts.week}-${persona.suffix}.md`;
    const content = await readFile(path, 'utf8');
    interviews.push(parseInterview(content, persona.label));
  }

  const reviewRaw = await readFile(weeklyReviewPath, 'utf8');
  const currentValidationSection = extractSection(reviewRaw, '2. ユーザー検証（項目 2）');
  const preservedScenarioSection = extractSubsection(currentValidationSection, '### シナリオ評価');
  const sectionText = buildValidationSection(interviews, preservedScenarioSection);
  const summary = {
    week: opts.week,
    completedInterviews: interviews.filter((entry) => entry.completed).length,
    totalInterviews: interviews.length,
    interviews,
  };

  if (opts.dryRun) {
    console.log('=== validation section preview ===');
    console.log(sectionText);
    console.log('\n=== parsed summary ===');
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const next = replaceValidationSection(reviewRaw, sectionText);
  await writeFile(weeklyReviewPath, next);

  console.log(`- weeklyValidationUpdated: ${weeklyReviewPath}`);
  console.log(JSON.stringify({
    week: opts.week,
    completedInterviews: summary.completedInterviews,
    totalInterviews: summary.totalInterviews,
  }, null, 2));
}

main().catch((error) => {
  console.error('[poc:sync-validation] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
