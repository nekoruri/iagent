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
      mcpServers: unknown[];
      constructor(opts: { name: string; instructions: string; tools: unknown[]; mcpServers?: unknown[] }) {
        this.name = opts.name;
        this.instructions = opts.instructions;
        this.tools = opts.tools;
        this.mcpServers = opts.mcpServers ?? [];
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

  it('allowedMcpToolNames を渡すとサーバーに callable toolFilter が設定される', async () => {
    const mockServer = { name: 'srv-a', toolFilter: undefined };
    const agent = await createHeartbeatAgent(
      [mockServer as any],
      ['srv-a/list_items', 'srv-b/get_data'],
    ) as unknown as { mcpServers: Array<{ toolFilter: Function }> };

    expect(agent.mcpServers).toHaveLength(1);
    expect(typeof agent.mcpServers[0].toolFilter).toBe('function');
  });

  it('callable toolFilter が qualified 名でフィルタする', async () => {
    const mockServer = { name: 'srv-a', toolFilter: undefined };
    const agent = await createHeartbeatAgent(
      [mockServer as any],
      ['srv-a/list_items'],
    ) as unknown as { mcpServers: Array<{ toolFilter: Function }> };

    const filter = agent.mcpServers[0].toolFilter;
    // srv-a の list_items → 許可
    expect(await filter({ serverName: 'srv-a' }, { name: 'list_items' })).toBe(true);
    // srv-a の get_data → 拒否
    expect(await filter({ serverName: 'srv-a' }, { name: 'get_data' })).toBe(false);
    // srv-b の list_items → 拒否（サーバー名不一致）
    expect(await filter({ serverName: 'srv-b' }, { name: 'list_items' })).toBe(false);
  });

  it('レガシー形式（/ なし）は任意サーバーにマッチする', async () => {
    const mockServer = { name: 'any-server', toolFilter: undefined };
    const agent = await createHeartbeatAgent(
      [mockServer as any],
      ['list_items'],
    ) as unknown as { mcpServers: Array<{ toolFilter: Function }> };

    const filter = agent.mcpServers[0].toolFilter;
    // 任意サーバーの list_items → 許可
    expect(await filter({ serverName: 'any-server' }, { name: 'list_items' })).toBe(true);
    expect(await filter({ serverName: 'other-server' }, { name: 'list_items' })).toBe(true);
    // 名前不一致 → 拒否
    expect(await filter({ serverName: 'any-server' }, { name: 'get_data' })).toBe(false);
  });

  it('qualified ツール名が instructions の MCP 制限ノートに含まれる', async () => {
    const mockServer = { name: 'srv-a', toolFilter: undefined };
    const agent = await createHeartbeatAgent(
      [mockServer as any],
      ['srv-a/list_items', 'srv-b/get_data'],
    ) as unknown as { instructions: string };

    expect(agent.instructions).toContain('list_items (srv-a)');
    expect(agent.instructions).toContain('get_data (srv-b)');
    expect(agent.instructions).toContain('MCP ツール使用制限');
  });
});
