import type { AutonomyEventStage, InterventionLevel } from '../types';

interface CreateAutonomyEventMetadataInput {
  stage: AutonomyEventStage;
  flowId?: string;
  eventId?: string;
  interventionLevel?: InterventionLevel;
  contextSnapshotId?: string;
  traceId?: string;
  nowTs?: number;
}

function createStableId(prefix: string, nowTs = Date.now()): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${nowTs}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${nowTs}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAutonomyFlowId(nowTs = Date.now()): string {
  return createStableId('flow', nowTs);
}

export function createContextSnapshotId(flowId: string): string {
  return `${flowId}-context`;
}

export function createAutonomyEventMetadata(input: CreateAutonomyEventMetadataInput) {
  const flowId = input.flowId ?? createAutonomyFlowId(input.nowTs);
  return {
    eventId: input.eventId ?? createStableId('event', input.nowTs),
    flowId,
    stage: input.stage,
    interventionLevel: input.interventionLevel,
    contextSnapshotId: input.contextSnapshotId,
    traceId: input.traceId,
  };
}
