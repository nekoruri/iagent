import type { HeartbeatCostControlConfig, HeartbeatModelGrade, HeartbeatTask } from '../types';

export type HeartbeatModelName = 'gpt-5-nano' | 'gpt-5-mini';

export interface HeartbeatTaskExecutionPolicy {
  model: HeartbeatModelName;
  modelGrade: HeartbeatModelGrade;
  maxCompletionTokens: number;
  degradedMaxCompletionTokens: number;
  critical: boolean;
}

export interface HeartbeatExecutionGroup {
  model: HeartbeatModelName;
  maxCompletionTokens: number;
  tasks: HeartbeatTask[];
}

export interface HeartbeatTokenBudgetState {
  enabled: boolean;
  dailyTokenBudget: number;
  pressureThreshold: number;
  usedTokensToday: number;
  remainingTokens: number;
  isOverBudget: boolean;
  isPressure: boolean;
}

export interface ModelTokenUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface HeartbeatTokenUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  byModel: Record<string, ModelTokenUsage>;
}

const STANDARD_GRADE_TASK_IDS = new Set([
  'briefing-morning',
  'reflection',
  'weekly-summary',
  'monthly-review',
  'pattern-recognition',
  'suggestion-optimization',
]);

export function getHeartbeatTaskExecutionPolicy(task: HeartbeatTask): HeartbeatTaskExecutionPolicy {
  const isBriefing = task.id.startsWith('briefing-');
  const standardGrade = isBriefing || STANDARD_GRADE_TASK_IDS.has(task.id);
  const critical = task.type === 'custom' || isBriefing || task.id === 'calendar-check';

  if (standardGrade) {
    return {
      model: 'gpt-5-mini',
      modelGrade: 'standard',
      maxCompletionTokens: 900,
      degradedMaxCompletionTokens: 480,
      critical,
    };
  }

  if (task.id === 'feed-check' || task.id === 'web-monitor-check') {
    return {
      model: 'gpt-5-nano',
      modelGrade: 'low',
      maxCompletionTokens: 650,
      degradedMaxCompletionTokens: 320,
      critical,
    };
  }

  return {
    model: 'gpt-5-nano',
    modelGrade: 'low',
    maxCompletionTokens: 400,
    degradedMaxCompletionTokens: 220,
    critical,
  };
}

export function groupTasksByExecutionPolicy(
  tasks: HeartbeatTask[],
  degradedMode: boolean,
): HeartbeatExecutionGroup[] {
  const grouped = new Map<string, HeartbeatExecutionGroup>();

  for (const task of tasks) {
    const policy = getHeartbeatTaskExecutionPolicy(task);
    const maxCompletionTokens = degradedMode
      ? policy.degradedMaxCompletionTokens
      : policy.maxCompletionTokens;
    const key = `${policy.model}:${maxCompletionTokens}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.tasks.push(task);
      continue;
    }
    grouped.set(key, {
      model: policy.model,
      maxCompletionTokens,
      tasks: [task],
    });
  }

  return [...grouped.values()];
}

export function getHeartbeatTokenBudgetState(
  config: HeartbeatCostControlConfig | undefined,
  usedTokensToday: number,
): HeartbeatTokenBudgetState {
  const enabled = Boolean(config?.enabled);
  const rawBudget = Number(config?.dailyTokenBudget);
  const dailyTokenBudget = Number.isFinite(rawBudget)
    ? Math.max(0, Math.floor(rawBudget))
    : 0;
  const thresholdRaw = Number.isFinite(config?.pressureThreshold)
    ? Number(config?.pressureThreshold)
    : 0.8;
  const pressureThreshold = Math.max(0.1, Math.min(0.95, thresholdRaw));
  const rawUsed = Number(usedTokensToday);
  const used = Number.isFinite(rawUsed)
    ? Math.max(0, Math.floor(rawUsed))
    : 0;

  if (!enabled || dailyTokenBudget <= 0) {
    return {
      enabled: false,
      dailyTokenBudget: 0,
      pressureThreshold,
      usedTokensToday: used,
      remainingTokens: Number.POSITIVE_INFINITY,
      isOverBudget: false,
      isPressure: false,
    };
  }

  const remainingTokens = Math.max(0, dailyTokenBudget - used);
  const isOverBudget = used >= dailyTokenBudget;
  const isPressure = used >= Math.floor(dailyTokenBudget * pressureThreshold);

  return {
    enabled: true,
    dailyTokenBudget,
    pressureThreshold,
    usedTokensToday: used,
    remainingTokens,
    isOverBudget,
    isPressure,
  };
}

export function selectTasksForCostPressure(
  tasks: HeartbeatTask[],
  budget: HeartbeatTokenBudgetState,
  deferNonCriticalTasks: boolean,
): { runnableTasks: HeartbeatTask[]; deferredTasks: HeartbeatTask[] } {
  if (!budget.enabled) {
    return { runnableTasks: tasks, deferredTasks: [] };
  }
  if (budget.isOverBudget) {
    return { runnableTasks: [], deferredTasks: tasks };
  }
  if (!budget.isPressure || !deferNonCriticalTasks) {
    return { runnableTasks: tasks, deferredTasks: [] };
  }

  const runnableTasks: HeartbeatTask[] = [];
  const deferredTasks: HeartbeatTask[] = [];

  for (const task of tasks) {
    const policy = getHeartbeatTaskExecutionPolicy(task);
    if (policy.critical) {
      runnableTasks.push(task);
    } else {
      deferredTasks.push(task);
    }
  }

  return { runnableTasks, deferredTasks };
}

export function createEmptyHeartbeatTokenUsage(): HeartbeatTokenUsage {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    byModel: {},
  };
}

function ensureModelUsage(usage: HeartbeatTokenUsage, model: string): ModelTokenUsage {
  const existing = usage.byModel[model];
  if (existing) return existing;
  const created: ModelTokenUsage = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  usage.byModel[model] = created;
  return created;
}

export function addTokenUsageSample(
  usage: HeartbeatTokenUsage,
  model: string,
  sample: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  },
): void {
  const hasAnyTokenValue = Number.isFinite(sample.inputTokens)
    || Number.isFinite(sample.outputTokens)
    || Number.isFinite(sample.totalTokens);
  if (!hasAnyTokenValue) return;

  const inputTokens = Math.max(0, Math.floor(sample.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(sample.outputTokens ?? 0));
  const totalTokens = Math.max(0, Math.floor(sample.totalTokens ?? (inputTokens + outputTokens)));

  usage.requests += 1;
  usage.inputTokens += inputTokens;
  usage.outputTokens += outputTokens;
  usage.totalTokens += totalTokens;

  const modelUsage = ensureModelUsage(usage, model);
  modelUsage.requests += 1;
  modelUsage.inputTokens += inputTokens;
  modelUsage.outputTokens += outputTokens;
  modelUsage.totalTokens += totalTokens;
}

export function mergeHeartbeatTokenUsage(
  target: HeartbeatTokenUsage,
  source: HeartbeatTokenUsage,
): void {
  target.requests += source.requests;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.totalTokens += source.totalTokens;

  for (const [model, modelUsage] of Object.entries(source.byModel)) {
    const targetModelUsage = ensureModelUsage(target, model);
    targetModelUsage.requests += modelUsage.requests;
    targetModelUsage.inputTokens += modelUsage.inputTokens;
    targetModelUsage.outputTokens += modelUsage.outputTokens;
    targetModelUsage.totalTokens += modelUsage.totalTokens;
  }
}
