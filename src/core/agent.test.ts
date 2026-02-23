import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { createAgent, createHeartbeatAgent } from './agent';
import { saveMemory } from '../store/memoryStore';

// Agent クラスをモックして instructions とツールを検証可能にする
vi.mock('@openai/agents', () => {
  return {
    Agent: class MockAgent {
      name: string;
      instructions: string;
      tools: unknown[];
      constructor(opts: { name: string; instructions: string; tools: unknown[] }) {
        this.name = opts.name;
        this.instructions = opts.instructions;
        this.tools = opts.tools;
      }
    },
    tool: vi.fn((opts) => ({ ...opts, __isTool: true })),
  };
});

vi.mock('../tools/calendarTool', () => ({
  calendarTool: { name: 'calendar', __isTool: true },
}));

vi.mock('../tools/webSearchTool', () => ({
  webSearchTool: { name: 'webSearch', __isTool: true },
}));

vi.mock('../tools/deviceInfoTool', () => ({
  deviceInfoTool: { name: 'deviceInfo', __isTool: true },
}));

vi.mock('../tools/memoryTool', () => ({
  memoryTool: { name: 'memory', __isTool: true },
}));

beforeEach(() => {
  __resetStores();
});

describe('createAgent', () => {
  it('メモリ0件の時、instructions に「あなたの記憶」が含まれない', async () => {
    const agent = await createAgent() as unknown as { instructions: string };
    expect(agent.instructions).not.toContain('あなたの記憶');
  });

  it('メモリありの時、instructions にメモリ内容が含まれる', async () => {
    await saveMemory('ユーザーは東京在住', 'fact');
    await saveMemory('朝にニュースを確認したい', 'preference');

    const agent = await createAgent() as unknown as { instructions: string };
    expect(agent.instructions).toContain('あなたの記憶');
    expect(agent.instructions).toContain('[fact] ユーザーは東京在住');
    expect(agent.instructions).toContain('[preference] 朝にニュースを確認したい');
  });

  it('memoryTool をツール一覧に含む', async () => {
    const agent = await createAgent() as unknown as { tools: Array<{ name: string }> };
    const toolNames = agent.tools.map((t) => t.name);
    expect(toolNames).toContain('memory');
  });

  it('メモリについての指示が instructions に含まれる', async () => {
    const agent = await createAgent() as unknown as { instructions: string };
    expect(agent.instructions).toContain('メモリについて');
    expect(agent.instructions).toContain('memory ツールの save アクション');
  });
});

describe('createHeartbeatAgent', () => {
  it('メモリ0件の時、instructions に記憶セクションが含まれない', async () => {
    const agent = await createHeartbeatAgent() as unknown as { instructions: string };
    expect(agent.instructions).not.toContain('ユーザーについての記憶');
  });

  it('メモリありの時、instructions にメモリ内容が含まれる', async () => {
    await saveMemory('ユーザーは東京在住', 'fact');

    const agent = await createHeartbeatAgent() as unknown as { instructions: string };
    expect(agent.instructions).toContain('ユーザーについての記憶');
    expect(agent.instructions).toContain('[fact] ユーザーは東京在住');
  });
});
