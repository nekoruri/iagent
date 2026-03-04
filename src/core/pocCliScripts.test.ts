import { spawnSync } from 'node:child_process';
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
});
