import { loadOpsEvents, type OpsEvent } from '../store/heartbeatStore';
import type {
  ChatMessage,
  DeviceContextSnapshotV1,
  FeedbackType,
  HeartbeatResult,
  HeartbeatSource,
  InterventionLevel,
  AutonomyEventStage,
} from '../types';

const STAGE_ORDER: AutonomyEventStage[] = ['trigger', 'context', 'decision', 'delivery', 'reaction'];

export interface AutonomyFlowSummary {
  flowId: string;
  startedAt: number;
  endedAt: number;
  source: HeartbeatSource | 'unknown';
  stages: AutonomyEventStage[];
  eventCount: number;
  taskIds: string[];
  channels: string[];
  traceId?: string;
  contextSnapshot?: DeviceContextSnapshotV1;
  latestOutcome?: 'success' | 'failure' | 'skipped' | FeedbackType | 'shown' | 'clicked';
  latestReason?: string;
  interventionLevel?: InterventionLevel;
}

export interface UserFacingAutonomyExplanation {
  whyNow: string;
  outcome?: string;
}

function orderStages(stages: Iterable<AutonomyEventStage>): AutonomyEventStage[] {
  const seen = new Set(stages);
  return STAGE_ORDER.filter((stage) => seen.has(stage));
}

function getLatestOutcome(event: OpsEvent): AutonomyFlowSummary['latestOutcome'] {
  if (event.feedbackType) return event.feedbackType;
  if (event.status) return event.status;
  if (event.type === 'notification-shown') return 'shown';
  if (event.type === 'notification-clicked') return 'clicked';
  return undefined;
}

export function summarizeAutonomyFlows(events: OpsEvent[]): AutonomyFlowSummary[] {
  const grouped = new Map<string, OpsEvent[]>();

  for (const event of events) {
    if (!event.flowId) continue;
    const list = grouped.get(event.flowId);
    if (list) {
      list.push(event);
    } else {
      grouped.set(event.flowId, [event]);
    }
  }

  return [...grouped.entries()]
    .map(([flowId, groupedEvents]) => {
      const sorted = [...groupedEvents].sort((a, b) => a.timestamp - b.timestamp);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const latestReason = [...sorted].reverse().find((event) => typeof event.reason === 'string')?.reason;
      const traceId = [...sorted].reverse().find((event) => typeof event.traceId === 'string')?.traceId;
      const contextSnapshot = sorted.find((event) => event.contextSnapshot)?.contextSnapshot;
      const interventionLevel = [...sorted].reverse().find((event) => event.interventionLevel)?.interventionLevel;

      return {
        flowId,
        startedAt: first.timestamp,
        endedAt: last.timestamp,
        source: first.source ?? 'unknown',
        stages: orderStages(
          sorted
            .map((event) => event.stage)
            .filter((stage): stage is AutonomyEventStage => typeof stage === 'string'),
        ),
        eventCount: sorted.length,
        taskIds: [...new Set(sorted.map((event) => event.taskId).filter((taskId): taskId is string => typeof taskId === 'string'))],
        channels: [
          ...new Set(
            sorted
              .map((event) => event.channel)
              .filter((channel): channel is NonNullable<OpsEvent['channel']> => typeof channel === 'string'),
          ),
        ],
        traceId,
        contextSnapshot,
        latestOutcome: getLatestOutcome(last),
        latestReason,
        interventionLevel,
      };
    })
    .sort((a, b) => b.endedAt - a.endedAt);
}

export async function loadRecentAutonomyFlows(limit = 10): Promise<AutonomyFlowSummary[]> {
  const events = await loadOpsEvents();
  return summarizeAutonomyFlows(events).slice(0, limit);
}

export async function loadAutonomyFlowsByIds(flowIds: string[]): Promise<Record<string, AutonomyFlowSummary>> {
  const requested = new Set(flowIds.filter((flowId) => flowId.length > 0));
  if (requested.size === 0) return {};

  const events = await loadOpsEvents();
  return Object.fromEntries(
    summarizeAutonomyFlows(events)
      .filter((flow) => requested.has(flow.flowId))
      .map((flow) => [flow.flowId, flow]),
  );
}

function sourceLabel(source: AutonomyFlowSummary['source']): string {
  switch (source) {
    case 'tab':
      return 'アプリ表示中';
    case 'worker':
      return 'タブ非表示中';
    case 'push':
      return 'Push 通知';
    case 'periodic-sync':
      return 'バックグラウンド同期';
    default:
      return '自動実行';
  }
}

function timeOfDayLabel(timeOfDay: DeviceContextSnapshotV1['timeOfDay']): string {
  switch (timeOfDay) {
    case 'morning':
      return '朝';
    case 'daytime':
      return '日中';
    case 'evening':
      return '夕方';
    case 'late-night':
      return '深夜';
  }
}

function calendarStateLabel(calendarState: DeviceContextSnapshotV1['calendarState']): string {
  switch (calendarState) {
    case 'empty':
      return '予定なし';
    case 'upcoming-soon':
      return '予定が近い';
    case 'in-meeting-window':
      return '会議時間帯';
    case 'busy-today':
      return '今日は予定あり';
  }
}

function focusStateLabel(focusState: DeviceContextSnapshotV1['focusState']): string {
  switch (focusState) {
    case 'focused':
      return 'フォーカス中';
    case 'quiet-hours':
      return '静かな時間';
    case 'normal':
      return '通常モード';
  }
}

function outcomeLabel(outcome: AutonomyFlowSummary['latestOutcome']): string | undefined {
  switch (outcome) {
    case 'clicked':
      return '通知から開きました。';
    case 'shown':
      return '通知として表示しました。';
    case 'accepted':
      return '内容は確認済みです。';
    case 'dismissed':
      return '不要として閉じられました。';
    case 'snoozed':
      return 'あとで確認するため保留されています。';
    case 'success':
      return '自動実行は正常に完了しました。';
    case 'failure':
      return '自動実行でエラーが発生しました。';
    case 'skipped':
      return '今回は表示条件に合わず見送りました。';
    default:
      return undefined;
  }
}

export function buildUserFacingAutonomyExplanation(flow: AutonomyFlowSummary): UserFacingAutonomyExplanation {
  const contextParts = flow.contextSnapshot
    ? [
        timeOfDayLabel(flow.contextSnapshot.timeOfDay),
        calendarStateLabel(flow.contextSnapshot.calendarState),
        focusStateLabel(flow.contextSnapshot.focusState),
      ]
    : [];

  return {
    whyNow: `${sourceLabel(flow.source)}に確認し、${contextParts.join(' / ') || '現在の文脈'}として扱いました。`,
    outcome: flow.latestReason
      ? `補足: ${flow.latestReason}`
      : outcomeLabel(flow.latestOutcome),
  };
}

export function buildHeartbeatChatMessage(
  result: HeartbeatResult,
  conversationId: string,
  flow?: AutonomyFlowSummary,
): ChatMessage {
  const explanation = flow ? buildUserFacingAutonomyExplanation(flow) : undefined;
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: `[Heartbeat] ${result.summary}`,
    timestamp: Date.now(),
    source: 'heartbeat',
    conversationId,
    explanationTitle: explanation ? 'この通知を今出した理由' : undefined,
    explanationWhyNow: explanation?.whyNow,
    explanationOutcome: explanation?.outcome,
  };
}
