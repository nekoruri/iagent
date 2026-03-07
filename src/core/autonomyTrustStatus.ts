import type {
  CapabilityLevel,
  HeartbeatCapabilityItem,
  HeartbeatCapabilitySnapshot,
} from './heartbeatCapabilities';
import type { HeartbeatConfig, PushConfig } from '../types';

export type AutonomyStatusState = 'active' | 'limited' | 'stopped';

export interface AutonomyStatusItem {
  id: 'execution' | 'delivery' | 'background';
  label: string;
  state: AutonomyStatusState;
  detail: string;
}

export interface AutonomyTrustStatusSummary {
  overallState: AutonomyStatusState;
  overallText: string;
  overallClassName: string;
  items: AutonomyStatusItem[];
  stopReasons: string[];
  controlHints: string[];
}

interface BuildAutonomyTrustStatusInput {
  heartbeat: HeartbeatConfig;
  push: PushConfig;
  hasApiKey: boolean;
  notificationPermission: 'granted' | 'denied' | 'default' | 'unsupported';
  hasPushSubscription: boolean;
  isQuietPeriod: boolean;
  capabilitySnapshot: HeartbeatCapabilitySnapshot | null;
}

function statusMeta(state: AutonomyStatusState): Pick<AutonomyTrustStatusSummary, 'overallText' | 'overallClassName'> {
  switch (state) {
    case 'active':
      return { overallText: '稼働中', overallClassName: 'mcp-status-connected' };
    case 'limited':
      return { overallText: '一部制限', overallClassName: 'mcp-status-warning' };
    case 'stopped':
      return { overallText: '停止中', overallClassName: 'mcp-status-error' };
  }
}

function itemStateFromCapability(level: CapabilityLevel): AutonomyStatusState {
  switch (level) {
    case 'yes':
      return 'active';
    case 'conditional':
    case 'unverified':
      return 'limited';
    case 'no':
      return 'stopped';
  }
}

function getCapabilityItem(
  snapshot: HeartbeatCapabilitySnapshot | null,
  id: HeartbeatCapabilityItem['id'],
): HeartbeatCapabilityItem | undefined {
  return snapshot?.items.find((item) => item.id === id);
}

export function buildAutonomyTrustStatus(input: BuildAutonomyTrustStatusInput): AutonomyTrustStatusSummary {
  const stopReasons: string[] = [];

  const executionState: AutonomyStatusItem = (() => {
    if (!input.hasApiKey) {
      stopReasons.push('OpenAI API キー未設定');
      return { id: 'execution', label: '自律実行', state: 'stopped', detail: 'API キー未設定のため、自律実行を開始できません。' };
    }
    if (!input.heartbeat.enabled) {
      stopReasons.push('Heartbeat 無効');
      return { id: 'execution', label: '自律実行', state: 'stopped', detail: 'Heartbeat が無効のため、自律実行は停止中です。' };
    }
    if (input.heartbeat.focusMode) {
      stopReasons.push('フォーカスモード');
      return { id: 'execution', label: '自律実行', state: 'limited', detail: 'フォーカスモード中のため、提案と通知を抑制しています。' };
    }
    if (input.isQuietPeriod) {
      stopReasons.push('quiet hours / quiet days');
      return { id: 'execution', label: '自律実行', state: 'limited', detail: '静かな時間帯のため、今は自律実行を抑制しています。' };
    }
    return { id: 'execution', label: '自律実行', state: 'active', detail: 'Heartbeat が有効で、実行条件も満たしています。' };
  })();

  const deliveryState: AutonomyStatusItem = (() => {
    if (input.notificationPermission === 'denied' || input.notificationPermission === 'unsupported') {
      stopReasons.push('通知権限なし');
      return { id: 'delivery', label: '通知の表示', state: 'stopped', detail: '通知権限がないため、visible notification は表示できません。' };
    }
    if (!input.heartbeat.desktopNotification && !input.push.enabled) {
      stopReasons.push('通知経路が無効');
      return { id: 'delivery', label: '通知の表示', state: 'stopped', detail: 'デスクトップ通知と Push の両方が無効です。' };
    }
    if (input.notificationPermission === 'default') {
      stopReasons.push('通知権限未設定');
      return { id: 'delivery', label: '通知の表示', state: 'limited', detail: '通知権限を許可すると、通知の表示が有効になります。' };
    }
    if (input.push.enabled && !input.hasPushSubscription) {
      stopReasons.push('Push 未購読');
      return { id: 'delivery', label: '通知の表示', state: 'limited', detail: '通知権限はありますが、Push 購読がまだ完了していません。' };
    }
    return { id: 'delivery', label: '通知の表示', state: 'active', detail: '通知権限と表示経路が有効です。' };
  })();

  const backgroundCapability = getCapabilityItem(input.capabilitySnapshot, 'background-wake-up');
  const backgroundState: AutonomyStatusItem = (() => {
    if (!input.push.enabled) {
      stopReasons.push('バックグラウンド wake-up 無効');
      return { id: 'background', label: 'バックグラウンド wake-up', state: 'stopped', detail: 'Push が無効のため、closed-state wake-up は停止中です。' };
    }
    if (!input.push.serverUrl.trim()) {
      stopReasons.push('Push サーバー未設定');
      return { id: 'background', label: 'バックグラウンド wake-up', state: 'limited', detail: 'Push サーバー URL を設定すると closed-state path を使えます。' };
    }
    if (!input.hasPushSubscription) {
      stopReasons.push('Push 未購読');
      return { id: 'background', label: 'バックグラウンド wake-up', state: 'limited', detail: 'Push 購読が完了すると closed-state wake-up を使えます。' };
    }
    if (backgroundCapability) {
      return {
        id: 'background',
        label: 'バックグラウンド wake-up',
        state: itemStateFromCapability(backgroundCapability.level),
        detail: backgroundCapability.detail,
      };
    }
    return { id: 'background', label: 'バックグラウンド wake-up', state: 'limited', detail: 'ブラウザ capability を確認中です。' };
  })();

  const items = [executionState, deliveryState, backgroundState];
  const overallState: AutonomyStatusState = executionState.state === 'stopped'
    ? 'stopped'
    : items.some((item) => item.state !== 'active')
      ? 'limited'
      : 'active';
  const overall = statusMeta(overallState);

  return {
    overallState,
    overallText: overall.overallText,
    overallClassName: overall.overallClassName,
    items,
    stopReasons: [...new Set(stopReasons)],
    controlHints: [
      '今すぐ止める: Heartbeat を無効化',
      '一時停止: フォーカスモードを有効化',
      '広く止める: 最小権限プリセットを適用',
    ],
  };
}
