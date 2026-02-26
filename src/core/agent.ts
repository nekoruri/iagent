import { Agent } from '@openai/agents';
import type { MCPServer } from '@openai/agents';
import { calendarTool } from '../tools/calendarTool';
import { webSearchTool } from '../tools/webSearchTool';
import { deviceInfoTool } from '../tools/deviceInfoTool';
import { memoryTool } from '../tools/memoryTool';
import { clipTool } from '../tools/clipTool';
import { feedTool } from '../tools/feedTool';
import { webMonitorTool } from '../tools/webMonitorTool';
import { getRelevantMemories } from '../store/memoryStore';
import { getConfig, getDefaultPersonaConfig } from './config';
import { buildMainInstructions, buildHeartbeatInstructions } from './instructionBuilder';

export async function createAgent(mcpServers?: MCPServer[]): Promise<Agent> {
  const config = getConfig();
  const persona = config.persona ?? getDefaultPersonaConfig();
  const memories = await getRelevantMemories('', 10);
  const instructions = buildMainInstructions({
    persona,
    memories,
    currentDateTime: new Date().toLocaleString('ja-JP'),
  });

  return new Agent({
    name: persona.name || 'iAgent',
    instructions,
    model: 'gpt-5-mini',
    tools: [calendarTool, webSearchTool, deviceInfoTool, memoryTool, clipTool, feedTool, webMonitorTool],
    mcpServers: mcpServers && mcpServers.length > 0 ? mcpServers : undefined,
  });
}

/** read-only ツール判定用プレフィックス */
const READ_ONLY_PREFIXES = ['list_', 'get_', 'search_', 'read_'];

/** ツール名が read-only かどうか判定する */
export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_PREFIXES.some((p) => name.startsWith(p));
}

export async function createHeartbeatAgent(
  mcpServers?: MCPServer[],
  allowedMcpToolNames?: string[],
): Promise<Agent> {
  const config = getConfig();
  const persona = config.persona ?? getDefaultPersonaConfig();
  const memories = await getRelevantMemories('', 5);
  const instructions = buildHeartbeatInstructions({
    persona,
    memories,
    currentDateTime: new Date().toLocaleString('ja-JP'),
    isHeartbeat: true,
  });

  // MCP ツールが指定されていない場合は MCP サーバーを渡さない
  const filteredMcpServers = allowedMcpToolNames && allowedMcpToolNames.length > 0
    ? mcpServers
    : undefined;

  const mcpToolNote = allowedMcpToolNames && allowedMcpToolNames.length > 0
    ? `\n\n利用可能な MCP ツール: ${allowedMcpToolNames.join(', ')}\n注意: 上記のツールのみ使用可能です。他の MCP ツールは使用しないでください。`
    : '';

  return new Agent({
    name: `${persona.name || 'iAgent'}-Heartbeat`,
    instructions: instructions + mcpToolNote,
    model: 'gpt-5-nano',
    tools: [calendarTool, deviceInfoTool],
    mcpServers: filteredMcpServers && filteredMcpServers.length > 0 ? filteredMcpServers : undefined,
  });
}
