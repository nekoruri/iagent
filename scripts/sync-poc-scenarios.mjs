#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

const DEFAULT_WEEKLY_DIR = 'docs/weekly';
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const PLACEHOLDER_TEXT = new Set([
  '-',
  '成立 / 微妙 / 非成立',
  'accepted / dismissed / snoozed / ignored / manual-open',
]);

function printHelp() {
  console.log(`Usage: npm run poc:sync-scenarios -- --week <YYYY-W##> [options]

Options:
  --week <id>          Required. Target week id (e.g. 2026-W12)
  --weekly-dir <dir>   Weekly docs dir (default: docs/weekly)
  --weekly-review <p>  Weekly review markdown path (default: <weekly-dir>/<week>.md)
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

function replaceValidationSection(content, sectionText) {
  const marker = '## 2. ユーザー検証（項目 2）';
  const start = content.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not find section: ${marker}`);
  }
  const next = content.indexOf('\n## ', start + marker.length);
  const end = next >= 0 ? next + 1 : content.length;
  return `${content.slice(0, start)}${sectionText.trimEnd()}\n\n${content.slice(end).replace(/^\n+/, '')}`;
}

function normalizeValue(raw) {
  const value = raw.trim();
  if (!value) return '';
  if (PLACEHOLDER_TEXT.has(value)) return '';
  if (/^[-\s]+$/.test(value)) return '';
  return value;
}

function extractField(content, prefix) {
  const line = content.split(/\r?\n/).find((item) => item.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

function extractStatus(content) {
  return extractField(content, 'ステータス:');
}

function parseScenario(content) {
  const status = normalizeValue(extractStatus(content));
  const scenarioId = normalizeValue(extractField(content, 'シナリオID:'));
  const scenarioName = normalizeValue(extractField(content, 'シナリオ名:'));
  const persona = normalizeValue(extractField(content, '想定ペルソナ:'));
  const value = normalizeValue(extractField(extractSection(content, '5. 評価'), '- 価値の再現性:'));
  const ops = normalizeValue(extractField(extractSection(content, '5. 評価'), '- 運用可能性:'));
  const observe = normalizeValue(extractField(extractSection(content, '5. 評価'), '- 観測可能性:'));
  const deviceAgent = normalizeValue(extractField(extractSection(content, '5. 評価'), '- 端末上エージェントらしさ:'));
  const good = normalizeValue(extractField(extractSection(content, '6. 学び'), '- 良かった点:'));
  const bad = normalizeValue(extractField(extractSection(content, '6. 学び'), '- 悪かった点:'));
  const hypothesis = normalizeValue(extractField(extractSection(content, '6. 学び'), '- 次の仮説:'));

  const completed = Boolean(
    (status && !/(未実施|予定)/.test(status))
    || value
    || ops
    || observe
    || deviceAgent
    || good
    || bad
    || hypothesis,
  );

  const grades = [value, ops, observe, deviceAgent].filter(Boolean);
  let overall = '';
  if (grades.length > 0) {
    if (grades.includes('非成立')) overall = '非成立';
    else if (grades.every((grade) => grade === '成立')) overall = '成立';
    else overall = '微妙';
  }

  return {
    scenarioId,
    scenarioName,
    persona,
    completed,
    overall,
    good,
    bad,
    hypothesis,
  };
}

function buildScenarioSubsection(entries) {
  const completed = entries.filter((entry) => entry.completed);
  const byOverall = (target) => completed.filter((entry) => entry.overall === target)
    .map((entry) => `[${entry.scenarioId}] ${entry.scenarioName || entry.persona}`);
  const insights = [
    ...completed.map((entry) => entry.hypothesis).filter(Boolean),
    ...completed.map((entry) => entry.bad).filter(Boolean),
    ...completed.map((entry) => entry.good).filter(Boolean),
  ].slice(0, 3);

  return `### シナリオ評価

- 完了シナリオ数: ${completed.length}/${entries.length}
- 実施シナリオ: ${completed.length > 0 ? completed.map((entry) => `[${entry.scenarioId}] ${entry.scenarioName || entry.persona}`).join(' / ') : 'なし'}
- 成立: ${byOverall('成立').length > 0 ? byOverall('成立').join(' / ') : 'なし'}
- 微妙: ${byOverall('微妙').length > 0 ? byOverall('微妙').join(' / ') : 'なし'}
- 非成立: ${byOverall('非成立').length > 0 ? byOverall('非成立').join(' / ') : 'なし'}
- 主要シナリオ学び:
  1. ${insights[0] || '未入力'}
  2. ${insights[1] || '未入力'}
  3. ${insights[2] || '未入力'}
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
  const scenariosDir = opts.scenariosDir || `${opts.weeklyDir}/scenarios`;
  const scenarioIds = ['S-A1', 'S-B1', 'S-C1', 'S-X1'];
  const entries = [];

  for (const scenarioId of scenarioIds) {
    const path = `${scenariosDir}/${opts.week}-${scenarioId}.md`;
    const content = await readFile(path, 'utf8');
    entries.push(parseScenario(content));
  }

  const reviewRaw = await readFile(weeklyReviewPath, 'utf8');
  const validationSection = extractSection(reviewRaw, '2. ユーザー検証（項目 2）');
  if (!validationSection) {
    throw new Error('Could not find weekly validation section');
  }
  const scenarioSection = buildScenarioSubsection(entries);
  const nextValidationSection = replaceSubsection(validationSection, '### シナリオ評価', scenarioSection);
  const next = replaceValidationSection(reviewRaw, nextValidationSection);

  if (opts.dryRun) {
    console.log('=== scenario subsection preview ===');
    console.log(scenarioSection);
    return;
  }

  await writeFile(weeklyReviewPath, next);
  console.log(`- weeklyScenarioUpdated: ${weeklyReviewPath}`);
  console.log(JSON.stringify({
    week: opts.week,
    completedScenarios: entries.filter((entry) => entry.completed).length,
    totalScenarios: entries.length,
  }, null, 2));
}

main().catch((error) => {
  console.error('[poc:sync-scenarios] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
