import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

// configStore モック
vi.mock('../store/configStore', () => ({
  saveConfigToIDB: vi.fn().mockResolvedValue(undefined),
}));

import { createAgent, createHeartbeatAgent } from './agent';
import { saveMemory } from '../store/memoryStore';
import { saveConfig, getDefaultHeartbeatConfig, getDefaultPersonaConfig } from './config';
import type { AppConfig } from '../types';

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
  localStorage.clear();
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

  it('instructions にタスク実行方針が含まれる', async () => {
    const agent = await createAgent() as unknown as { instructions: string };
    expect(agent.instructions).toContain('タスク実行方針');
    expect(agent.instructions).toContain('必要なステップを特定する');
  });

  it('memoryTool をツール一覧に含む', async () => {
    const agent = await createAgent() as unknown as { tools: Array<{ name: string }> };
    const toolNames = agent.tools.map((t) => t.name);
    expect(toolNames).toContain('memory');
  });

  it('メモリ管理ガイドラインが instructions に含まれる', async () => {
    const agent = await createAgent() as unknown as { instructions: string };
    expect(agent.instructions).toContain('メモリ管理ガイドライン');
  });

  it('instructions に全ツール名が含まれる', async () => {
    const agent = await createAgent() as unknown as { instructions: string };
    expect(agent.instructions).toContain('calendar');
    expect(agent.instructions).toContain('web_search');
    expect(agent.instructions).toContain('device_info');
    expect(agent.instructions).toContain('memory');
    expect(agent.instructions).toContain('clip');
    expect(agent.instructions).toContain('feed');
    expect(agent.instructions).toContain('web_monitor');
  });

  it('persona.name が Agent の name に反映される', async () => {
    const config: AppConfig = {
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: getDefaultHeartbeatConfig(),
      persona: { ...getDefaultPersonaConfig(), name: 'MyBot' },
    };
    saveConfig(config);

    const agent = await createAgent() as unknown as { name: string; instructions: string };
    expect(agent.name).toBe('MyBot');
    expect(agent.instructions).toContain('MyBot');
  });

  it('persona の personality が instructions に反映される', async () => {
    const config: AppConfig = {
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: getDefaultHeartbeatConfig(),
      persona: { ...getDefaultPersonaConfig(), personality: '丁寧で親しみやすい' },
    };
    saveConfig(config);

    const agent = await createAgent() as unknown as { instructions: string };
    expect(agent.instructions).toContain('丁寧で親しみやすい');
  });

  it('デフォルトペルソナで name が iAgent になる', async () => {
    const agent = await createAgent() as unknown as { name: string };
    expect(agent.name).toBe('iAgent');
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

  it('persona.name が Heartbeat Agent の name に反映される', async () => {
    const config: AppConfig = {
      openaiApiKey: 'sk-test',
      braveApiKey: '',
      openWeatherMapApiKey: '',
      mcpServers: [],
      heartbeat: getDefaultHeartbeatConfig(),
      persona: { ...getDefaultPersonaConfig(), name: 'MyBot' },
    };
    saveConfig(config);

    const agent = await createHeartbeatAgent() as unknown as { name: string };
    expect(agent.name).toBe('MyBot-Heartbeat');
  });

  it('JSON 出力形式が instructions に含まれる', async () => {
    const agent = await createHeartbeatAgent() as unknown as { instructions: string };
    expect(agent.instructions).toContain('"taskId"');
    expect(agent.instructions).toContain('"hasChanges"');
    expect(agent.instructions).toContain('JSON形式');
  });
});
