import { describe, expect, it } from 'vitest';
import { buildAutonomyActionBoundarySummary } from './autonomyActionBoundary';

describe('buildAutonomyActionBoundarySummary', () => {
  it('現在の action boundary を要約できる', () => {
    const summary = buildAutonomyActionBoundarySummary();

    expect(summary.overallText).toBe('ローカル再設定まで');
    expect(summary.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'read', state: 'allowed' }),
      expect.objectContaining({ id: 'suggest', state: 'allowed' }),
      expect.objectContaining({ id: 'prepare', state: 'allowed' }),
      expect.objectContaining({ id: 'execute-local', state: 'allowed-limited' }),
      expect.objectContaining({ id: 'execute-external', state: 'blocked' }),
    ]));
  });
});
