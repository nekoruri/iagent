import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
});
