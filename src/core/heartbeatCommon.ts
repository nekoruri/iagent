import { isQuietHours, getTodayNotificationCount, isTaskConditionMatched } from './heartbeat';
import { loadConfigFromIDB } from '../store/configStore';
import {
  addHeartbeatResult,
  updateTaskLastRun,
  batchUpdateTaskLastRun,
  getAllTaskLastRun,
  loadHeartbeatState,
  appendOpsEvent,
  getTodayHeartbeatTokenUsage,
} from '../store/heartbeatStore';
import { executeWorkerHeartbeatCheck } from './heartbeatOpenAI';
import { getHeartbeatTokenBudgetState, selectTasksForCostPressure } from './heartbeatCost';
import { getDB } from '../store/db';
import { getRelevantMemories, getMemoriesForBriefing } from '../store/memoryStore';
import { getDefaultPersonaConfig } from './config';
import { createAutonomyEventMetadata, createAutonomyFlowId, createContextSnapshotId } from './autonomyEvent';
import { createDeviceContextSnapshot } from './contextSnapshot';
import {
  classifyHeartbeatFailureReason,
  getReasonBudgetMetadata,
  getSuppressionInterventionLevel,
} from './autonomyReason';
import { buildHeartbeatNotificationReason, shouldIncludeNotificationReason } from './heartbeatNotificationText';
import { FETCH_TIMEOUT_MS } from './heartbeatOpenAI';
import type {
  CalendarEvent,
  DeviceContextSnapshotV1,
  HeartbeatConfig,
  HeartbeatResult,
  HeartbeatSource,
  HeartbeatTask,
} from '../types';

/** executeHeartbeatAndStore の戻り値 */
export interface HeartbeatAndStoreResult {
  results: HeartbeatResult[];
  configChanged: boolean;
}

/** IndexedDB から最新設定を読み込み、API キーと Heartbeat 設定を返す */
export async function loadFreshConfig(
  fallbackApiKey: string,
  fallbackHeartbeat: HeartbeatConfig,
): Promise<{ apiKey: string; heartbeat: HeartbeatConfig }> {
  try {
    const freshConfig = await loadConfigFromIDB();
    if (freshConfig?.heartbeat) {
      return {
        apiKey: freshConfig.openaiApiKey || fallbackApiKey,
        heartbeat: freshConfig.heartbeat,
      };
    }
  } catch {
    // IndexedDB 読み取り失敗は無視して現在の設定で続行
  }
  return { apiKey: fallbackApiKey, heartbeat: fallbackHeartbeat };
}

/** タスクごとのスケジュールを評価し、実行すべきタスクを返す（Worker / SW 共通） */
export async function getTasksDueFromIDB(hbConfig: HeartbeatConfig): Promise<HeartbeatTask[]> {
  const now = Date.now();
  const currentDate = new Date();
  const currentHour = currentDate.getHours();
  const currentMinute = currentDate.getMinutes();
  const enabledTasks = hbConfig.tasks.filter((t) => t.enabled);
  const dueTasks: HeartbeatTask[] = [];

  // state を1回ロードして全タスクの lastRun を参照（N+1 防止）
  const taskLastRunMap = await getAllTaskLastRun();

  for (const task of enabledTasks) {
    if (!isTaskConditionMatched(task, currentDate)) {
      continue;
    }

    const schedule = task.schedule;
    const lastRun = taskLastRunMap[task.id] ?? 0;

    if (!schedule || schedule.type === 'global') {
      // グローバル間隔: taskLastRun で個別追跡（飢餓防止）
      const intervalMs = hbConfig.intervalMinutes * 60_000;
      if (now - lastRun >= intervalMs) {
        dueTasks.push(task);
      }
    } else if (schedule.type === 'interval') {
      const intervalMs = (schedule.intervalMinutes ?? hbConfig.intervalMinutes) * 60_000;
      if (now - lastRun >= intervalMs) {
        dueTasks.push(task);
      }
    } else if (schedule.type === 'fixed-time') {
      // 固定時刻: 対象時刻を過ぎていて今日まだ未実行（±1分ウィンドウだと見逃す可能性があるため）
      const targetHour = schedule.hour ?? 8;
      const targetMinute = schedule.minute ?? 0;
      const currentTotalMinutes = currentHour * 60 + currentMinute;
      const targetTotalMinutes = targetHour * 60 + targetMinute;
      if (currentTotalMinutes >= targetTotalMinutes) {
        const todayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
        if (lastRun < todayStart) {
          dueTasks.push(task);
        }
      }
    }
  }

  return dueTasks;
}

/**
 * Heartbeat チェックを実行し、結果を IndexedDB に保存する。
 * Worker / Service Worker 共通のパイプライン。
 * @param apiKey フォールバック用 API キー（通常は空文字で IDB から取得）
 * @param source 実行元の識別子
 * @returns 変化ありの結果 + configChanged フラグ
 */
export async function executeHeartbeatAndStore(apiKey: string, source?: HeartbeatSource): Promise<HeartbeatAndStoreResult> {
  const EMPTY: HeartbeatAndStoreResult = { results: [], configChanged: false };
  const startedAt = Date.now();
  const sourceLabel = source ?? 'unknown';
  const flowId = createAutonomyFlowId(startedAt);
  const contextSnapshotId = createContextSnapshotId(flowId);
  const logStage = async (
    stage: 'trigger' | 'context' | 'delivery',
    contextSnapshot?: DeviceContextSnapshotV1,
    extras: Record<string, unknown> = {},
  ) => {
    await appendOpsEvent({
      ...createAutonomyEventMetadata({
        flowId,
        stage,
        interventionLevel: stage === 'delivery'
          ? getSuppressionInterventionLevel((extras.reason as Parameters<typeof getSuppressionInterventionLevel>[0]) ?? 'no_changes')
          : 'L0',
        contextSnapshotId,
        nowTs: Date.now(),
      }),
      type: 'autonomy-stage',
      timestamp: Date.now(),
      source: sourceLabel,
      contextSnapshot,
      ...extras,
    }).catch(() => {});
  };
  const logRun = async (
    status: 'success' | 'failure' | 'skipped',
    extras: Record<string, unknown> = {},
    contextSnapshot?: DeviceContextSnapshotV1,
  ) => {
    await appendOpsEvent({
      ...createAutonomyEventMetadata({
        flowId,
        stage: 'decision',
        interventionLevel: 'L0',
        contextSnapshotId,
        traceId: typeof extras.traceId === 'string' ? extras.traceId : undefined,
        nowTs: Date.now(),
      }),
      type: 'heartbeat-run',
      timestamp: Date.now(),
      source: sourceLabel,
      contextSnapshot,
      status,
      durationMs: Date.now() - startedAt,
      ...extras,
    }).catch(() => {});
  };

  await logStage('trigger');

  // IndexedDB から最新設定を読み込む
  const freshConfig = await loadConfigFromIDB();
  const hbConfig = freshConfig?.heartbeat;
  if (!hbConfig || !hbConfig.enabled) {
    await logRun('skipped', { reason: 'disabled' });
    return EMPTY;
  }

  const db = await getDB();
  const calendarEvents: CalendarEvent[] = await db.getAll('calendar');
  const contextSnapshot = createDeviceContextSnapshot({
    now: new Date(startedAt),
    calendarEvents,
    focusMode: hbConfig.focusMode,
    isQuietPeriod: isQuietHours(hbConfig, new Date(startedAt)),
  });
  const notificationReason = buildHeartbeatNotificationReason(contextSnapshot);
  await logStage('context', contextSnapshot);

  if (isQuietHours(hbConfig)) {
    await logStage('delivery', contextSnapshot, { reason: 'quiet_hours' });
    await logRun('skipped', { reason: 'quiet_hours' }, contextSnapshot);
    return EMPTY;
  }
  if (hbConfig.focusMode) {
    console.debug('[Heartbeat SW] フォーカスモード中 — スキップ');
    await logStage('delivery', contextSnapshot, { reason: 'focus_mode' });
    await logRun('skipped', { reason: 'focus_mode' }, contextSnapshot);
    return EMPTY;
  }

  // 日次通知上限チェック
  if (hbConfig.maxNotificationsPerDay > 0) {
    const state = await loadHeartbeatState();
    const todayCount = getTodayNotificationCount(state.recentResults);
    if (todayCount >= hbConfig.maxNotificationsPerDay) {
      console.debug(`[Heartbeat:${source ?? 'unknown'}] 日次通知上限到達 — スキップ`);
      await logStage('delivery', contextSnapshot, { reason: 'daily_quota_reached' });
      await logRun('skipped', { reason: 'daily_quota_reached' }, contextSnapshot);
      return EMPTY;
    }
  }

  const resolvedApiKey = freshConfig?.openaiApiKey || apiKey;
  if (!resolvedApiKey) {
    await logStage('delivery', contextSnapshot, { reason: 'no_api_key' });
    await logRun('skipped', { reason: 'no_api_key' }, contextSnapshot);
    return EMPTY;
  }

  // 実行すべきタスクを判定
  const tasks = await getTasksDueFromIDB(hbConfig);
  if (tasks.length === 0) {
    await logStage('delivery', contextSnapshot, { reason: 'no_due_tasks' });
    await logRun('skipped', { reason: 'no_due_tasks' }, contextSnapshot);
    return EMPTY;
  }
  if (contextSnapshot.onlineState === 'offline') {
    await logStage('delivery', contextSnapshot, { reason: 'offline' });
    await logRun(
      'skipped',
      {
        reason: 'offline',
        ...getReasonBudgetMetadata('offline'),
      },
      contextSnapshot,
    );
    return EMPTY;
  }

  const tokenBudget = getHeartbeatTokenBudgetState(
    hbConfig.costControl,
    await getTodayHeartbeatTokenUsage(),
  );
  const { runnableTasks, deferredTasks } = selectTasksForCostPressure(
    tasks,
    tokenBudget,
    hbConfig.costControl?.deferNonCriticalTasks ?? true,
  );
  if (deferredTasks.length > 0) {
    await batchUpdateTaskLastRun(deferredTasks.map((task) => task.id), Date.now());
  }
  if (runnableTasks.length === 0) {
    const reason = tokenBudget.isOverBudget ? 'token_budget_exceeded' : 'token_budget_deferred';
    await logStage('delivery', contextSnapshot, { reason });
    await logRun(
      'skipped',
      {
        reason,
        ...getReasonBudgetMetadata(reason, {
          budgetValue: tokenBudget.usedTokensToday,
          budgetThreshold: tokenBudget.dailyTokenBudget,
        }),
        taskCount: tasks.length,
        deferredTaskCount: deferredTasks.length,
        tokenBudget: tokenBudget.dailyTokenBudget,
        tokensUsedToday: tokenBudget.usedTokensToday,
      },
      contextSnapshot,
    );
    return EMPTY;
  }

  // 先制的に taskLastRun を更新（パース失敗時の再実行ループ防止）
  await batchUpdateTaskLastRun(runnableTasks.map(t => t.id), Date.now());

  const hasBriefing = runnableTasks.some((t) => t.id.startsWith('briefing-'));
  const memories = hasBriefing
    ? await getMemoriesForBriefing(15)
    : await getRelevantMemories('', 5);

  // persona を取得（未設定時はデフォルト）
  const persona = freshConfig?.persona ?? getDefaultPersonaConfig();

  try {
    const { results, configChanged, usage } = await executeWorkerHeartbeatCheck(
      resolvedApiKey,
      runnableTasks,
      calendarEvents,
      memories,
      persona,
      { degradedMode: tokenBudget.isPressure },
    );

    const now = Date.now();
    const heartbeatResults: HeartbeatResult[] = [];

    console.log(`[Heartbeat:${sourceLabel}] ${results.length} 件のタスクを実行`);

    for (const r of results) {
      const tagged = {
        ...r,
        source,
        pinned: r.taskId.startsWith('briefing-') || r.taskId === 'reflection' || r.taskId === 'monthly-review' || r.taskId === 'suggestion-optimization',
        flowId,
        contextSnapshotId,
        notificationReason: shouldIncludeNotificationReason(r.taskId) ? notificationReason : undefined,
      };
      await addHeartbeatResult(tagged);
      await updateTaskLastRun(r.taskId, now);
      if (r.hasChanges) {
        heartbeatResults.push(tagged);
      }
    }

    console.log(`[Heartbeat:${sourceLabel}] 完了: 変化あり=${heartbeatResults.length}, 変化なし=${results.length - heartbeatResults.length}${configChanged ? ', 設定変更あり' : ''}`);
    if (heartbeatResults.length === 0) {
      await logStage('delivery', contextSnapshot, { reason: 'no_changes' });
    }

    await logRun(
      'success',
      {
        taskCount: runnableTasks.length,
        deferredTaskCount: deferredTasks.length,
        resultCount: results.length,
        changedCount: heartbeatResults.length,
        requestCount: usage.requests,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        modelUsage: usage.byModel,
        tokenBudget: tokenBudget.enabled ? tokenBudget.dailyTokenBudget : undefined,
        tokensUsedToday: tokenBudget.enabled ? tokenBudget.usedTokensToday : undefined,
        pressureMode: tokenBudget.enabled ? tokenBudget.isPressure : undefined,
      },
      contextSnapshot,
    );
    return { results: heartbeatResults, configChanged };
  } catch (error) {
    const failureBudget = classifyHeartbeatFailureReason(error, contextSnapshot, FETCH_TIMEOUT_MS);
    await logRun(
      'failure',
      {
        reason: failureBudget.reason,
        budgetType: failureBudget.budgetType,
        budgetAction: failureBudget.budgetAction,
        budgetValue: failureBudget.budgetValue,
        budgetThreshold: failureBudget.budgetThreshold,
        taskCount: runnableTasks.length,
        deferredTaskCount: deferredTasks.length,
        errorMessage: error instanceof Error ? error.message : String(error),
        tokenBudget: tokenBudget.enabled ? tokenBudget.dailyTokenBudget : undefined,
        tokensUsedToday: tokenBudget.enabled ? tokenBudget.usedTokensToday : undefined,
        pressureMode: tokenBudget.enabled ? tokenBudget.isPressure : undefined,
      },
      contextSnapshot,
    );
    if (failureBudget.reason) {
      await logStage('delivery', contextSnapshot, { reason: failureBudget.reason });
    }
    throw error;
  }
}
