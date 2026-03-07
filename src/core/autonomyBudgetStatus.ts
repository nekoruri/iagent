import { loadOpsEvents } from '../store/heartbeatStore';
import type { HeartbeatConfig } from '../types';

export type BudgetStatusState = 'ok' | 'watch' | 'limited';

export interface BudgetStatusItem {
  id: 'battery' | 'token' | 'latency' | 'storage' | 'network';
  label: string;
  state: BudgetStatusState;
  detail: string;
}

export interface BudgetStatusSummary {
  items: BudgetStatusItem[];
}

interface BuildBudgetStatusInput {
  heartbeat: HeartbeatConfig;
  tokensUsedToday: number;
  latencyP95Ms?: number;
  isOnline: boolean;
  storageInfo: {
    persistent: boolean;
    usage: number;
    quota: number;
  } | null;
  hasBackgroundPath: boolean;
}

function formatTokens(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString();
}

function formatMs(value?: number): string {
  if (!value || !Number.isFinite(value)) return 'NoData';
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function budgetClassState(ok: boolean, watch: boolean): BudgetStatusState {
  if (ok) return 'ok';
  if (watch) return 'watch';
  return 'limited';
}

export function buildBudgetStatusSummary(input: BuildBudgetStatusInput): BudgetStatusSummary {
  const tokenBudget = input.heartbeat.costControl?.enabled ? Number(input.heartbeat.costControl.dailyTokenBudget ?? 0) : 0;
  const tokenRatio = tokenBudget > 0 ? input.tokensUsedToday / tokenBudget : 0;
  const pressureThreshold = input.heartbeat.costControl?.pressureThreshold ?? 0.8;

  const storageRatio = input.storageInfo && input.storageInfo.quota > 0
    ? input.storageInfo.usage / input.storageInfo.quota
    : 0;

  return {
    items: [
      {
        id: 'battery',
        label: 'battery',
        state: input.hasBackgroundPath ? 'ok' : 'watch',
        detail: input.hasBackgroundPath
          ? 'Push 優先で background path を使います。battery は主に browser / OS 側の制約で守られます。'
          : 'background path が弱いため、foreground 寄りで動作します。battery は browser / OS 側の制約頼みです。',
      },
      {
        id: 'token',
        label: 'token',
        state: tokenBudget <= 0
          ? 'watch'
          : budgetClassState(tokenRatio < pressureThreshold, tokenRatio < 1),
        detail: tokenBudget <= 0
          ? `日次トークン予算は無制限です。今日の使用量は ${formatTokens(input.tokensUsedToday)} tokens です。`
          : `今日の使用量は ${formatTokens(input.tokensUsedToday)} / ${formatTokens(tokenBudget)} tokens です。しきい値は ${Math.round(pressureThreshold * 100)}% です。`,
      },
      {
        id: 'latency',
        label: 'latency',
        state: input.latencyP95Ms == null
          ? 'watch'
          : budgetClassState(input.latencyP95Ms <= 30_000, input.latencyP95Ms <= 45_000),
        detail: `直近24hの Heartbeat p95 は ${formatMs(input.latencyP95Ms)} です。45s を超えると alert 扱いです。`,
      },
      {
        id: 'storage',
        label: 'storage',
        state: input.storageInfo == null
          ? 'watch'
          : budgetClassState(input.storageInfo.persistent && storageRatio < 0.8, storageRatio < 0.95),
        detail: input.storageInfo == null
          ? 'Storage API 非対応のため usage / quota を取得できません。'
          : `使用量は ${Math.round(storageRatio * 100)}% です。永続化: ${input.storageInfo.persistent ? '有効' : '無効'}。`,
      },
      {
        id: 'network',
        label: 'network',
        state: input.isOnline ? 'ok' : 'limited',
        detail: input.isOnline
          ? 'オンラインです。proxy / push / API 呼び出しを継続できます。'
          : 'オフラインです。ネットワーク依存の自律経路は停止し、foreground のみへ寄ります。',
      },
    ],
  };
}

export async function loadHeartbeatLatencyP95(hours = 24, nowTs = Date.now()): Promise<number | undefined> {
  const cutoff = nowTs - hours * 60 * 60 * 1000;
  const durations = (await loadOpsEvents())
    .filter((event) =>
      event.type === 'heartbeat-run'
      && event.status === 'success'
      && typeof event.durationMs === 'number'
      && event.timestamp >= cutoff,
    )
    .map((event) => Number(event.durationMs))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  if (durations.length === 0) return undefined;
  const index = Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1);
  return durations[index];
}
