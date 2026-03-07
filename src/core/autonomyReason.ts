import type { DeviceContextSnapshotV1, InterventionLevel } from '../types';

export type AutonomyReason =
  | 'disabled'
  | 'quiet_hours'
  | 'focus_mode'
  | 'daily_quota_reached'
  | 'offline'
  | 'no_api_key'
  | 'no_due_tasks'
  | 'token_budget_exceeded'
  | 'token_budget_deferred'
  | 'no_changes'
  | 'notification_permission_default'
  | 'notification_permission_denied'
  | 'notification_unsupported'
  | 'network_error'
  | 'latency_timeout';

export interface AutonomyBudgetMetadata {
  budgetType?: 'battery' | 'token' | 'latency' | 'storage' | 'network';
  budgetAction?: 'warn' | 'defer' | 'skip' | 'degrade' | 'disable';
  budgetValue?: number;
  budgetThreshold?: number;
}

const NETWORK_ERROR_RE = /(failed to fetch|networkerror|network request failed|load failed|err_network|err_internet_disconnected|err_name_not_resolved)/i;
const TIMEOUT_ERROR_RE = /(タイムアウト|timeout)/i;

export function sceneLabel(scene: DeviceContextSnapshotV1['scene']): string {
  switch (scene) {
    case 'morning-briefing':
      return '朝の確認時間';
    case 'pre-meeting':
      return '会議前';
    case 'focused-work':
      return '集中作業中';
    case 'evening-review':
      return '夕方の振り返り時間';
    case 'offline-recovery':
      return 'オフライン中';
    case 'late-night':
      return '深夜帯';
    default:
      return '通常の場面';
  }
}

export function autonomyReasonLabel(reason?: string): string | undefined {
  switch (reason) {
    case 'disabled':
      return '自律実行が無効です。';
    case 'quiet_hours':
      return '静かな時間帯のため見送りました。';
    case 'focus_mode':
      return 'フォーカスモード中のため見送りました。';
    case 'daily_quota_reached':
      return '日次通知上限に達したため見送りました。';
    case 'offline':
      return 'オフラインのため見送りました。';
    case 'no_api_key':
      return 'API キー未設定のため実行できませんでした。';
    case 'no_due_tasks':
      return '今この場面で実行対象のタスクはありませんでした。';
    case 'token_budget_exceeded':
      return 'トークン予算を超過したため見送りました。';
    case 'token_budget_deferred':
      return 'トークン予算を考慮して次回に回しました。';
    case 'no_changes':
      return '今回は変化がなかったため通知しませんでした。';
    case 'notification_permission_default':
      return '通知権限が未設定のため通知できませんでした。';
    case 'notification_permission_denied':
      return '通知権限がブロックされているため通知できませんでした。';
    case 'notification_unsupported':
      return 'このブラウザでは通知を利用できません。';
    case 'network_error':
      return 'ネットワーク起因の失敗で完了できませんでした。';
    case 'latency_timeout':
      return '応答が遅くタイムアウトしました。';
    default:
      return reason ? `補足: ${reason}` : undefined;
  }
}

export function getSuppressionInterventionLevel(reason: AutonomyReason): InterventionLevel {
  switch (reason) {
    case 'no_due_tasks':
    case 'no_changes':
      return 'L1';
    case 'quiet_hours':
    case 'focus_mode':
    case 'daily_quota_reached':
    case 'notification_permission_default':
    case 'notification_permission_denied':
    case 'notification_unsupported':
      return 'L3';
    default:
      return 'L2';
  }
}

export function getReasonBudgetMetadata(
  reason: AutonomyReason,
  extras: Partial<AutonomyBudgetMetadata> = {},
): AutonomyBudgetMetadata {
  if (reason === 'token_budget_exceeded') {
    return { budgetType: 'token', budgetAction: 'skip', ...extras };
  }
  if (reason === 'token_budget_deferred') {
    return { budgetType: 'token', budgetAction: 'defer', ...extras };
  }
  if (reason === 'offline') {
    return { budgetType: 'network', budgetAction: 'skip', ...extras };
  }
  if (reason === 'network_error') {
    return { budgetType: 'network', budgetAction: 'degrade', ...extras };
  }
  if (reason === 'latency_timeout') {
    return { budgetType: 'latency', budgetAction: 'degrade', ...extras };
  }
  return extras;
}

export function classifyHeartbeatFailureReason(
  error: unknown,
  contextSnapshot?: DeviceContextSnapshotV1,
  timeoutThresholdMs?: number,
): { reason?: AutonomyReason } & AutonomyBudgetMetadata {
  if (contextSnapshot?.onlineState === 'offline') {
    return getReasonBudgetMetadata('offline');
  }

  const message = error instanceof Error ? error.message : String(error);
  if (TIMEOUT_ERROR_RE.test(message)) {
    return {
      reason: 'latency_timeout',
      ...getReasonBudgetMetadata('latency_timeout', {
        budgetValue: timeoutThresholdMs,
        budgetThreshold: timeoutThresholdMs,
      }),
    };
  }
  if (NETWORK_ERROR_RE.test(message)) {
    return {
      reason: 'network_error',
      ...getReasonBudgetMetadata('network_error'),
    };
  }
  return {};
}
