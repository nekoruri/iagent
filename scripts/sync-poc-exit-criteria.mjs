#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';

const DEFAULT_WEEKLY_DIR = 'docs/weekly';
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const WEEKLY_FILE_RE = /^(\d{4}-W\d{2})\.md$/;
const PERSONAS = [
  { label: '情報収集型', suffix: 'info-collector' },
  { label: 'PM型', suffix: 'pm' },
  { label: '学習者型', suffix: 'learner' },
];
const SCENARIO_IDS = ['S-A1', 'S-B1', 'S-C1', 'S-X1'];
const NONE_PATTERNS = [/^とくにない/i, /^特にない/i, /^該当なし/i, /^未収集$/i, /^なし$/i, /^ない$/i];

function printHelp() {
  console.log(`Usage: npm run poc:sync-exit-criteria -- --week <YYYY-W##> [options]

Options:
  --week <id>          Required. Target week id (e.g. 2026-W12)
  --weekly-dir <dir>   Weekly docs dir (default: docs/weekly)
  --weekly-review <p>  Weekly review markdown path (default: <weekly-dir>/<week>.md)
  --interviews-dir <d> Interview notes dir (default: <weekly-dir>/interviews)
  --scenarios-dir <d>  Scenario notes dir (default: <weekly-dir>/scenarios)
  --dry-run            Print generated subsection without writing file
  --help               Show this help
`);
}

function parseArgs(argv) {
  const args = {
    week: '',
    weeklyDir: DEFAULT_WEEKLY_DIR,
    weeklyReview: '',
    interviewsDir: '',
    scenariosDir: '',
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
    if (a === '--scenarios-dir') {
      args.scenariosDir = argv[i + 1] ?? '';
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

function compareWeekIds(a, b) {
  const ma = a.match(WEEK_RE);
  const mb = b.match(WEEK_RE);
  if (!ma || !mb) return a.localeCompare(b);
  const yearDiff = Number(ma[1]) - Number(mb[1]);
  if (yearDiff !== 0) return yearDiff;
  return Number(ma[2]) - Number(mb[2]);
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
  const start = content.indexOf(heading);
  if (start < 0) return '';
  const nextSub = content.indexOf('\n### ', start + heading.length);
  const nextSec = content.indexOf('\n## ', start + heading.length);
  const nextCandidates = [nextSub, nextSec].filter((value) => value >= 0);
  const end = nextCandidates.length > 0 ? Math.min(...nextCandidates) + 1 : content.length;
  return content.slice(start, end);
}

function replaceSubsection(section, heading, replacement) {
  const current = extractSubsection(section, heading);
  if (!current) {
    return `${section.trimEnd()}\n\n${replacement.trimEnd()}\n`;
  }
  const start = section.indexOf(current);
  const end = start + current.length;
  return `${section.slice(0, start)}${replacement.trimEnd()}\n${section.slice(end).replace(/^\n+/, '')}`;
}

function replaceSection(content, heading, replacement) {
  const marker = `## ${heading}`;
  const start = content.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not find section: ${marker}`);
  }
  const next = content.indexOf('\n## ', start + marker.length);
  const end = next >= 0 ? next + 1 : content.length;
  return `${content.slice(0, start)}${replacement.trimEnd()}\n\n${content.slice(end).replace(/^\n+/, '')}`;
}

function extractLineByPrefix(content, prefix) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith(prefix)) continue;
    return line.slice(prefix.length).trim();
  }
  return '';
}

function extractOverallStatus(line) {
  const match = line.match(/Overall=(Good|Watch|Action|NoData)/);
  return match?.[1] ?? '';
}

function parseAlertState(content) {
  const section = extractSection(content, '3. SLO（項目 4）');
  const marker = 'アラート発生:';
  const start = section.indexOf(marker);
  if (start < 0) return 'unknown';
  const nextLine = section
    .slice(start + marker.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('- '));
  if (!nextLine) return 'unknown';
  if (nextLine === '- なし') return 'none';
  if (nextLine === '- あり') return 'present';
  return 'unknown';
}

function normalizeInterviewValue(raw) {
  const value = raw.trim();
  if (!value) return '';
  if (/^[-\s]+$/.test(value)) return '';
  if (value === '多い / 少ない / 適切') return '';
  if (value === '悪い / 普通 / 良い') return '';
  if (value === 'ある / ない') return '';
  return value;
}

function isInterviewCompleted(status) {
  return Boolean(status && !/(未実施|未入力|予定)/.test(status));
}

function isHelpfulEvidence(value) {
  if (!value) return false;
  return !NONE_PATTERNS.some((pattern) => pattern.test(value));
}

function parseScenarioOverall(content) {
  const section = extractSection(content, '5. 評価');
  const values = [
    extractLineByPrefix(section, '- 価値の再現性:'),
    extractLineByPrefix(section, '- 運用可能性:'),
    extractLineByPrefix(section, '- 観測可能性:'),
    extractLineByPrefix(section, '- 端末上エージェントらしさ:'),
  ].filter(Boolean);
  if (values.length === 0) return '';
  if (values.includes('非成立')) return '非成立';
  if (values.every((value) => value === '成立')) return '成立';
  return '微妙';
}

async function fileExists(path) {
  try {
    await readFile(path, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function listWeeklyReviewIds(weeklyDir, targetWeek) {
  const entries = await readdir(weeklyDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && WEEKLY_FILE_RE.test(entry.name))
    .map((entry) => entry.name.match(WEEKLY_FILE_RE)?.[1] ?? '')
    .filter((weekId) => weekId && compareWeekIds(weekId, targetWeek) <= 0)
    .sort(compareWeekIds);
}

async function collectWeeklyEvidence(weeklyDir, weekIds) {
  const reviews = [];
  for (const weekId of weekIds) {
    const path = `${weeklyDir}/${weekId}.md`;
    const raw = await readFile(path, 'utf8');
    reviews.push({
      weekId,
      kpiOverall: extractOverallStatus(extractLineByPrefix(raw, '- KPI 判定:')),
      sloOverall: extractOverallStatus(extractLineByPrefix(raw, '- SLO 判定:')),
      alertState: parseAlertState(raw),
    });
  }
  return reviews;
}

async function collectInterviewEvidence(interviewsDir, weekIds) {
  const personaCounts = new Map(PERSONAS.map((persona) => [persona.label, 0]));

  for (const weekId of weekIds) {
    for (const persona of PERSONAS) {
      const path = `${interviewsDir}/${weekId}-${persona.suffix}.md`;
      if (!await fileExists(path)) continue;
      const raw = await readFile(path, 'utf8');
      const status = extractLineByPrefix(raw, 'ステータス:');
      if (!isInterviewCompleted(status)) continue;
      const positiveSection = extractSection(raw, '2. よかった提案（価値が高かったもの）');
      const proposal = normalizeInterviewValue(extractLineByPrefix(positiveSection, '- 提案内容:'));
      if (isHelpfulEvidence(proposal)) {
        personaCounts.set(persona.label, (personaCounts.get(persona.label) ?? 0) + 1);
      }
    }
  }

  return personaCounts;
}

async function collectScenarioEvidence(scenariosDir, weekIds) {
  const successCounts = new Map(SCENARIO_IDS.map((id) => [id, 0]));
  const completedCounts = new Map(SCENARIO_IDS.map((id) => [id, 0]));

  for (const weekId of weekIds) {
    for (const scenarioId of SCENARIO_IDS) {
      const path = `${scenariosDir}/${weekId}-${scenarioId}.md`;
      if (!await fileExists(path)) continue;
      const raw = await readFile(path, 'utf8');
      const status = extractLineByPrefix(raw, 'ステータス:');
      const overall = parseScenarioOverall(raw);
      const completed = Boolean(overall) || Boolean(status && !/未実施|予定/.test(status));
      if (!completed) continue;
      completedCounts.set(scenarioId, (completedCounts.get(scenarioId) ?? 0) + 1);
      if (overall === '成立') {
        successCounts.set(scenarioId, (successCounts.get(scenarioId) ?? 0) + 1);
      }
    }
  }

  return { successCounts, completedCounts };
}

function buildStatus({ reviews, personaCounts, scenarioEvidence }) {
  const recentTwo = reviews.slice(-2);
  const kpiStable = recentTwo.length >= 2 && recentTwo.every((review) => ['Good', 'Watch'].includes(review.kpiOverall));
  const kpiReset = recentTwo.length >= 2 && recentTwo.every((review) => review.kpiOverall === 'Action');
  const sloStable = recentTwo.length >= 2 && recentTwo.every((review) => ['Good', 'Watch'].includes(review.sloOverall) && review.alertState === 'none');
  const sloReset = recentTwo.length >= 2 && recentTwo.every((review) => review.sloOverall === 'Action' || review.alertState === 'present');
  const personaReady = PERSONAS.every((persona) => (personaCounts.get(persona.label) ?? 0) >= 3);
  const scenariosWithTwoSuccesses = SCENARIO_IDS
    .filter((scenarioId) => (scenarioEvidence.successCounts.get(scenarioId) ?? 0) >= 2)
    .length;
  const revisitReady = (scenarioEvidence.successCounts.get('S-X1') ?? 0) >= 2;
  const scenarioReady = scenariosWithTwoSuccesses >= 3 && revisitReady;

  let status = 'Extend';
  if (kpiReset || sloReset) {
    status = 'Reset';
  } else if (kpiStable && sloStable && personaReady && scenarioReady) {
    status = 'Go';
  }

  return {
    status,
    kpiStable,
    sloStable,
    personaReady,
    scenarioReady,
    scenariosWithTwoSuccesses,
    revisitReady,
  };
}

function buildReasons(status, aggregated, reviews, personaCounts, scenarioEvidence) {
  if (status === 'Reset') {
    const reasons = [];
    if (aggregated.kpiStable === false && reviews.slice(-2).every((review) => review.kpiOverall === 'Action')) {
      reasons.push('直近 2 週の KPI Overall が連続で Action です。');
    }
    if (aggregated.sloStable === false && reviews.slice(-2).every((review) => review.sloOverall === 'Action' || review.alertState === 'present')) {
      reasons.push('直近 2 週の SLO が連続で Alert / Action 寄りです。');
    }
    if (reasons.length === 0) {
      reasons.push('価値または運用の hard fail signal が継続しています。');
    }
    return reasons;
  }

  if (status === 'Go') {
    return [
      '直近 2 週の KPI / SLO が Go 条件を満たしています。',
      '3 ペルソナすべてで助かった体験の evidence が各 3 件以上あります。',
      '代表シナリオの成立証拠が複数週にまたがって揃っています。',
    ];
  }

  const reasons = [];
  if (!aggregated.kpiStable) {
    reasons.push('直近 2 週の KPI evidence がまだ不足しています。');
  }
  if (!aggregated.sloStable) {
    reasons.push('直近 2 週の SLO 安定 evidence がまだ不足しています。');
  }
  if (!aggregated.personaReady) {
    const personaSummary = PERSONAS
      .map((persona) => `${persona.label} ${(personaCounts.get(persona.label) ?? 0)}/3`)
      .join(' / ');
    reasons.push(`助かった体験の evidence が不足しています（${personaSummary}）。`);
  }
  if (!aggregated.scenarioReady) {
    const scenarioSummary = SCENARIO_IDS
      .map((scenarioId) => `${scenarioId} ${(scenarioEvidence.successCounts.get(scenarioId) ?? 0)}回成立`)
      .join(' / ');
    reasons.push(`シナリオ成立 evidence が不足しています（${scenarioSummary}）。`);
  }
  if (reasons.length === 0) {
    reasons.push('Go/Reset を判断するだけの累積 evidence がまだ不足しています。');
  }
  return reasons.slice(0, 3);
}

function buildExitCriteriaSubsection(opts) {
  const { status, reviews, personaCounts, scenarioEvidence, aggregated } = opts;
  const recentTwo = reviews.slice(-2);
  const kpiSummary = recentTwo.length > 0
    ? recentTwo.map((review) => `${review.weekId}=${review.kpiOverall || 'Unknown'}`).join(' / ')
    : 'weekly review なし';
  const sloSummary = recentTwo.length > 0
    ? recentTwo.map((review) => `${review.weekId}=${review.sloOverall || 'Unknown'}${review.alertState === 'none' ? '(alertなし)' : review.alertState === 'present' ? '(alertあり)' : ''}`).join(' / ')
    : 'weekly review なし';
  const personaSummary = PERSONAS
    .map((persona) => `${persona.label} ${(personaCounts.get(persona.label) ?? 0)}/3`)
    .join(' / ');
  const scenarioSummary = SCENARIO_IDS
    .map((scenarioId) => `${scenarioId} ${(scenarioEvidence.successCounts.get(scenarioId) ?? 0)}回成立`)
    .join(' / ');
  const reasons = buildReasons(status, aggregated, reviews, personaCounts, scenarioEvidence);

  return `### Exit Criteria 状態

- 判定: ${status}
- 自動集計:
  1. 直近2週 KPI: ${kpiSummary}
  2. 直近2週 SLO: ${sloSummary}
  3. 助かった体験 evidence: ${personaSummary}
  4. シナリオ成立 evidence: ${scenarioSummary} / 2回以上成立シナリオ ${aggregated.scenariosWithTwoSuccesses}/3
- 主な根拠:
  1. ${reasons[0] ?? '未入力'}
  2. ${reasons[1] ?? '未入力'}
  3. ${reasons[2] ?? '未入力'}
- 補足:
  - free text の trust regression は手動レビュー対象とし、この自動集計では hard fail 判定に含めません。
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

  const weeklyReviewPath = opts.weeklyReview || `${opts.weeklyDir}/${opts.week}.md`;
  const interviewsDir = opts.interviewsDir || `${opts.weeklyDir}/interviews`;
  const scenariosDir = opts.scenariosDir || `${opts.weeklyDir}/scenarios`;

  const weekIds = await listWeeklyReviewIds(opts.weeklyDir, opts.week);
  const reviews = await collectWeeklyEvidence(opts.weeklyDir, weekIds);
  const personaCounts = await collectInterviewEvidence(interviewsDir, weekIds);
  const scenarioEvidence = await collectScenarioEvidence(scenariosDir, weekIds);
  const aggregated = buildStatus({ reviews, personaCounts, scenarioEvidence });
  const subsection = buildExitCriteriaSubsection({
    status: aggregated.status,
    reviews,
    personaCounts,
    scenarioEvidence,
    aggregated,
  });

  if (opts.dryRun) {
    console.log('=== exit criteria subsection preview ===');
    console.log(subsection);
    return;
  }

  const reviewRaw = await readFile(weeklyReviewPath, 'utf8');
  const actionSection = extractSection(reviewRaw, '4. 次週アクション');
  if (!actionSection) {
    throw new Error('Could not find weekly action section');
  }
  const nextActionSection = replaceSubsection(actionSection, '### Exit Criteria 状態', subsection);
  const next = replaceSection(reviewRaw, '4. 次週アクション', nextActionSection);
  await writeFile(weeklyReviewPath, next);

  console.log(`- weeklyExitCriteriaUpdated: ${weeklyReviewPath}`);
  console.log(JSON.stringify({
    week: opts.week,
    status: aggregated.status,
    recentWeeks: reviews.slice(-2),
    personaEvidence: Object.fromEntries(personaCounts),
    scenarioEvidence: Object.fromEntries(scenarioEvidence.successCounts),
  }, null, 2));
}

main().catch((error) => {
  console.error('[poc:sync-exit-criteria] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
