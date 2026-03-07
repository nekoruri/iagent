import { describe, expect, it } from 'vitest';
import { createAutonomyEventMetadata, createAutonomyFlowId, createContextSnapshotId } from './autonomyEvent';

describe('autonomyEvent', () => {
  it('flowId を生成する', () => {
    const flowId = createAutonomyFlowId(123);
    expect(flowId).toContain('flow-123-');
  });

  it('contextSnapshotId は flowId に紐づく', () => {
    expect(createContextSnapshotId('flow-1')).toBe('flow-1-context');
  });

  it('event metadata を生成する', () => {
    const metadata = createAutonomyEventMetadata({
      flowId: 'flow-1',
      stage: 'delivery',
      interventionLevel: 'L3',
      contextSnapshotId: 'flow-1-context',
      traceId: 'trace-1',
      nowTs: 100,
    });

    expect(metadata).toEqual({
      eventId: expect.stringContaining('event-100-'),
      flowId: 'flow-1',
      stage: 'delivery',
      interventionLevel: 'L3',
      contextSnapshotId: 'flow-1-context',
      traceId: 'trace-1',
    });
  });
});
