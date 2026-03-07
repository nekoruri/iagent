import { describe, expect, it } from 'vitest';
import { buildHeartbeatChatMessage, summarizeAutonomyFlows } from './autonomyDiagnostics';
import type { OpsEvent } from '../store/heartbeatStore';

describe('autonomyDiagnostics', () => {
  it('flowId ごとに ops-event を集約する', () => {
    const summaries = summarizeAutonomyFlows([
      {
        type: 'heartbeat-run',
        flowId: 'flow-1',
        stage: 'decision',
        interventionLevel: 'L0',
        timestamp: 100,
        source: 'worker',
        status: 'success',
        taskId: 'calendar-check',
        traceId: 'trace-1',
        contextSnapshot: {
          capturedAt: 90,
          timeOfDay: 'morning',
          calendarState: 'upcoming-soon',
          onlineState: 'online',
          focusState: 'normal',
          deviceMode: 'desktop-browser',
          installState: 'browser',
          scene: 'pre-meeting',
        },
      },
      {
        type: 'notification-shown',
        flowId: 'flow-1',
        stage: 'delivery',
        interventionLevel: 'L3',
        timestamp: 150,
        source: 'worker',
        channel: 'desktop',
      },
      {
        type: 'notification-clicked',
        flowId: 'flow-1',
        stage: 'reaction',
        interventionLevel: 'L4',
        timestamp: 200,
        source: 'push',
        channel: 'push',
      },
    ] satisfies OpsEvent[]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual(expect.objectContaining({
      flowId: 'flow-1',
      source: 'worker',
      stages: ['decision', 'delivery', 'reaction'],
      eventCount: 3,
      taskIds: ['calendar-check'],
      channels: ['desktop', 'push'],
      traceId: 'trace-1',
      latestOutcome: 'clicked',
      interventionLevel: 'L4',
    }));
    expect(summaries[0].contextSnapshot?.calendarState).toBe('upcoming-soon');
  });

  it('flowId がないイベントは diagnostics から除外する', () => {
    const summaries = summarizeAutonomyFlows([
      {
        type: 'heartbeat-run',
        timestamp: 100,
        source: 'worker',
        status: 'success',
      },
    ] satisfies OpsEvent[]);

    expect(summaries).toEqual([]);
  });

  it('複数 flow は新しい順に並べる', () => {
    const summaries = summarizeAutonomyFlows([
      {
        type: 'heartbeat-run',
        flowId: 'flow-old',
        stage: 'decision',
        timestamp: 100,
        source: 'worker',
        status: 'success',
      },
      {
        type: 'heartbeat-run',
        flowId: 'flow-new',
        stage: 'decision',
        timestamp: 200,
        source: 'push',
        status: 'failure',
        reason: 'no_api_key',
      },
    ] satisfies OpsEvent[]);

    expect(summaries.map((summary) => summary.flowId)).toEqual(['flow-new', 'flow-old']);
    expect(summaries[0].latestReason).toBe('no_api_key');
    expect(summaries[0].latestOutcome).toBe('failure');
  });

  it('flow から heartbeat chat message を組み立てる', () => {
    const message = buildHeartbeatChatMessage(
      {
        taskId: 'calendar-check',
        timestamp: 200,
        hasChanges: true,
        summary: '予定が近いです',
      },
      'conv-1',
      {
        flowId: 'flow-1',
        startedAt: 100,
        endedAt: 200,
        source: 'push',
        stages: ['decision', 'delivery', 'reaction'],
        eventCount: 3,
        taskIds: ['calendar-check'],
        channels: ['push'],
        contextSnapshot: {
          capturedAt: 90,
          timeOfDay: 'morning',
          calendarState: 'upcoming-soon',
          onlineState: 'online',
          focusState: 'normal',
          deviceMode: 'desktop-browser',
          installState: 'browser',
          scene: 'pre-meeting',
        },
        latestOutcome: 'clicked',
      },
    );

    expect(message).toEqual(expect.objectContaining({
      role: 'assistant',
      source: 'heartbeat',
      conversationId: 'conv-1',
      content: '[Heartbeat] 予定が近いです',
      explanationTitle: 'この通知を今出した理由',
    }));
    expect(message.explanationWhyNow).toContain('Push 通知');
    expect(message.explanationWhyNow).toContain('会議前');
  });
});
