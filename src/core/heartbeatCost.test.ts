import { describe, it, expect } from 'vitest';
import {
  addTokenUsageSample,
  createEmptyHeartbeatTokenUsage,
  getHeartbeatTaskExecutionPolicy,
  getHeartbeatTokenBudgetState,
  groupTasksByExecutionPolicy,
  mergeHeartbeatTokenUsage,
  selectTasksForCostPressure,
} from './heartbeatCost';
import type { HeartbeatTask } from '../types';

const builtinTask = (id: string): HeartbeatTask => ({
  id,
  name: id,
  description: id,
  enabled: true,
  type: 'builtin',
});

describe('getHeartbeatTaskExecutionPolicy', () => {
  it('briefing は standard モデルで実行される', () => {
    const policy = getHeartbeatTaskExecutionPolicy(builtinTask('briefing-morning'));
    expect(policy.model).toBe('gpt-5-mini');
    expect(policy.modelGrade).toBe('standard');
    expect(policy.critical).toBe(true);
  });

  it('calendar-check は low モデルかつ critical 扱いになる', () => {
    const policy = getHeartbeatTaskExecutionPolicy(builtinTask('calendar-check'));
    expect(policy.model).toBe('gpt-5-nano');
    expect(policy.modelGrade).toBe('low');
    expect(policy.critical).toBe(true);
  });
});

describe('groupTasksByExecutionPolicy', () => {
  it('モデルとトークン上限ごとにグループ化される', () => {
    const groups = groupTasksByExecutionPolicy([
      builtinTask('calendar-check'),
      builtinTask('feed-check'),
      builtinTask('briefing-morning'),
    ], false);
    const keys = groups.map((g) => `${g.model}:${g.maxCompletionTokens}`).sort();
    expect(keys).toContain('gpt-5-nano:400');
    expect(keys).toContain('gpt-5-nano:650');
    expect(keys).toContain('gpt-5-mini:900');
  });

  it('degradedMode では縮退トークン上限を使う', () => {
    const groups = groupTasksByExecutionPolicy([builtinTask('briefing-morning')], true);
    expect(groups).toHaveLength(1);
    expect(groups[0].maxCompletionTokens).toBe(480);
  });
});

describe('getHeartbeatTokenBudgetState', () => {
  it('予算無制限なら制御を無効扱いにする', () => {
    const budget = getHeartbeatTokenBudgetState({
      enabled: true,
      dailyTokenBudget: 0,
      pressureThreshold: 0.8,
      deferNonCriticalTasks: true,
    }, 1200);
    expect(budget.enabled).toBe(false);
    expect(budget.isOverBudget).toBe(false);
  });

  it('予算を超えると overBudget になる', () => {
    const budget = getHeartbeatTokenBudgetState({
      enabled: true,
      dailyTokenBudget: 1000,
      pressureThreshold: 0.8,
      deferNonCriticalTasks: true,
    }, 1100);
    expect(budget.enabled).toBe(true);
    expect(budget.isOverBudget).toBe(true);
    expect(budget.isPressure).toBe(true);
  });
});

describe('selectTasksForCostPressure', () => {
  it('pressure 時に non-critical タスクを defer する', () => {
    const budget = getHeartbeatTokenBudgetState({
      enabled: true,
      dailyTokenBudget: 1000,
      pressureThreshold: 0.8,
      deferNonCriticalTasks: true,
    }, 900);
    const { runnableTasks, deferredTasks } = selectTasksForCostPressure([
      builtinTask('calendar-check'),
      builtinTask('feed-check'),
    ], budget, true);
    expect(runnableTasks.map((t) => t.id)).toEqual(['calendar-check']);
    expect(deferredTasks.map((t) => t.id)).toEqual(['feed-check']);
  });
});

describe('token usage helpers', () => {
  it('usage をモデル別に集計できる', () => {
    const usage = createEmptyHeartbeatTokenUsage();
    addTokenUsageSample(usage, 'gpt-5-nano', { inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    addTokenUsageSample(usage, 'gpt-5-mini', { inputTokens: 50, outputTokens: 30, totalTokens: 80 });
    expect(usage.requests).toBe(2);
    expect(usage.totalTokens).toBe(200);
    expect(usage.byModel['gpt-5-nano'].totalTokens).toBe(120);
    expect(usage.byModel['gpt-5-mini'].totalTokens).toBe(80);
  });

  it('usage をマージできる', () => {
    const a = createEmptyHeartbeatTokenUsage();
    const b = createEmptyHeartbeatTokenUsage();
    addTokenUsageSample(a, 'gpt-5-nano', { totalTokens: 100 });
    addTokenUsageSample(b, 'gpt-5-nano', { totalTokens: 50 });
    mergeHeartbeatTokenUsage(a, b);
    expect(a.totalTokens).toBe(150);
    expect(a.byModel['gpt-5-nano'].totalTokens).toBe(150);
  });
});
