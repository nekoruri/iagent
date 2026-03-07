import { describe, expect, it } from 'vitest';
import {
  autonomyReasonLabel,
  classifyHeartbeatFailureReason,
  getReasonBudgetMetadata,
  sceneLabel,
} from './autonomyReason';

describe('autonomyReason', () => {
  it('scene を人間向けラベルへ変換する', () => {
    expect(sceneLabel('morning-briefing')).toBe('朝の確認時間');
    expect(sceneLabel('pre-meeting')).toBe('会議前');
    expect(sceneLabel('offline-recovery')).toBe('オフライン中');
  });

  it('suppression / failure reason を人間向けラベルへ変換する', () => {
    expect(autonomyReasonLabel('quiet_hours')).toBe('静かな時間帯のため見送りました。');
    expect(autonomyReasonLabel('latency_timeout')).toBe('応答が遅くタイムアウトしました。');
  });

  it('offline と timeout を budget metadata に変換する', () => {
    expect(getReasonBudgetMetadata('offline')).toEqual(expect.objectContaining({
      budgetType: 'network',
      budgetAction: 'skip',
    }));
    expect(getReasonBudgetMetadata('latency_timeout')).toEqual(expect.objectContaining({
      budgetType: 'latency',
      budgetAction: 'degrade',
    }));
  });

  it('error から network / latency reason を判定する', () => {
    expect(classifyHeartbeatFailureReason(new Error('OpenAI API タイムアウト (90秒)'), undefined, 90_000))
      .toEqual(expect.objectContaining({
        reason: 'latency_timeout',
        budgetType: 'latency',
      }));
    expect(classifyHeartbeatFailureReason(new TypeError('Failed to fetch')))
      .toEqual(expect.objectContaining({
        reason: 'network_error',
        budgetType: 'network',
      }));
  });
});
