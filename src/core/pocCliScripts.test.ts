import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type RunResult = {
  status: number | null;
};

function runCli(scriptPath: string, args: string[]): RunResult {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
  });

  return {
    status: result.status,
  };
}

function expectHelp(scriptPath: string) {
  const result = runCli(scriptPath, ['--help']);
  expect(result.status).toBe(0);
}

function expectInvalidWeek(scriptPath: string) {
  const result = runCli(scriptPath, ['--week', '2026W11']);
  expect(result.status).toBe(1);
}

describe('PoC CLI scripts', () => {
  it('init-poc-week: help and week format validation', () => {
    expectHelp('scripts/init-poc-week.mjs');
    expectInvalidWeek('scripts/init-poc-week.mjs');
  });

  it('sync-poc-validation: help and week format validation', () => {
    expectHelp('scripts/sync-poc-validation.mjs');
    expectInvalidWeek('scripts/sync-poc-validation.mjs');
  });

  it('check-poc-week: help and week format validation', () => {
    expectHelp('scripts/check-poc-week.mjs');
    expectInvalidWeek('scripts/check-poc-week.mjs');
  });

  it('run-poc-week: help and week format validation', () => {
    expectHelp('scripts/run-poc-week.mjs');
    expectInvalidWeek('scripts/run-poc-week.mjs');
  });

  it('close-poc-week: help and week/as-of format validation', () => {
    expectHelp('scripts/close-poc-week.mjs');
    expectInvalidWeek('scripts/close-poc-week.mjs');

    const badAsOf = runCli('scripts/close-poc-week.mjs', ['--week', '2026-W11', '--as-of', '20260320']);
    expect(badAsOf.status).toBe(1);
  });

  it('collect-poc-metrics: help and week format validation', () => {
    expectHelp('scripts/collect-poc-metrics.mjs');
    expectInvalidWeek('scripts/collect-poc-metrics.mjs');
  });

  it('check-poc-week: can write summary JSON report', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'iagent-week-check-'));
    const week = '2026-W20';
    const reportPath = join(workDir, 'check-report.json');

    const initResult = runCli('scripts/init-poc-week.mjs', ['--week', week, '--weekly-dir', workDir]);
    expect(initResult.status).toBe(0);

    const checkResult = runCli('scripts/check-poc-week.mjs', [
      '--week',
      week,
      '--weekly-dir',
      workDir,
      '--report-json',
      reportPath,
    ]);
    expect(checkResult.status).toBe(0);

    const json = JSON.parse(await readFile(reportPath, 'utf8')) as {
      week: string;
      counts: { errors: number; warnings: number };
      ok: boolean;
    };
    expect(json.week).toBe(week);
    expect(json.counts.errors).toBe(0);
    expect(json.ok).toBe(true);

    await rm(workDir, { recursive: true, force: true });
  });

  it('check-poc-week: require-interviews is warning before due date and error after due date', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'iagent-week-check-due-'));
    const week = '2026-W20';

    const initResult = runCli('scripts/init-poc-week.mjs', ['--week', week, '--weekly-dir', workDir]);
    expect(initResult.status).toBe(0);

    const beforeDue = runCli('scripts/check-poc-week.mjs', [
      '--week',
      week,
      '--weekly-dir',
      workDir,
      '--require-interviews',
      '--as-of',
      '2026-01-01',
    ]);
    expect(beforeDue.status).toBe(0);

    const afterDue = runCli('scripts/check-poc-week.mjs', [
      '--week',
      week,
      '--weekly-dir',
      workDir,
      '--require-interviews',
      '--as-of',
      '2026-12-31',
    ]);
    expect(afterDue.status).toBe(2);

    await rm(workDir, { recursive: true, force: true });
  });

  it('check-poc-week: completed interview with blank required fields is warn/non-strict and error/strict', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'iagent-week-check-completed-'));
    const week = '2026-W21';
    const interviewPath = join(workDir, 'interviews', `${week}-info-collector.md`);
    const reportWarnPath = join(workDir, 'check-warn.json');
    const reportStrictPath = join(workDir, 'check-strict.json');

    const initResult = runCli('scripts/init-poc-week.mjs', ['--week', week, '--weekly-dir', workDir]);
    expect(initResult.status).toBe(0);

    const raw = await readFile(interviewPath, 'utf8');
    const updated = raw.replace('ステータス: 未実施', 'ステータス: 実施済み');
    await writeFile(interviewPath, updated);

    const nonStrict = runCli('scripts/check-poc-week.mjs', [
      '--week',
      week,
      '--weekly-dir',
      workDir,
      '--report-json',
      reportWarnPath,
    ]);
    expect(nonStrict.status).toBe(0);

    const warnJson = JSON.parse(await readFile(reportWarnPath, 'utf8')) as {
      issues: Array<{ severity: string; path: string; message: string }>;
    };
    expect(
      warnJson.issues.some(
        (issue) => issue.severity === 'warn'
          && issue.path === interviewPath
          && issue.message.includes('実施済みだが必須項目が未入力です'),
      ),
    ).toBe(true);

    const strict = runCli('scripts/check-poc-week.mjs', [
      '--week',
      week,
      '--weekly-dir',
      workDir,
      '--strict',
      '--report-json',
      reportStrictPath,
    ]);
    expect(strict.status).toBe(2);

    const strictJson = JSON.parse(await readFile(reportStrictPath, 'utf8')) as {
      issues: Array<{ severity: string; path: string; message: string }>;
    };
    expect(
      strictJson.issues.some(
        (issue) => issue.severity === 'error'
          && issue.path === interviewPath
          && issue.message.includes('実施済みだが必須項目が未入力です'),
      ),
    ).toBe(true);

    await rm(workDir, { recursive: true, force: true });
  });
});
