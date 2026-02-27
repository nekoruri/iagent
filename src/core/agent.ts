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

// 後方互換の re-export
export { isReadOnlyTool } from './toolUtils';

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
    ? `\n\n## MCP ツール使用制限\n利用可能な MCP ツール: ${allowedMcpToolNames.join(', ')}\n【重要】上記リスト以外の MCP ツールを呼び出さないでください。許可されていないツール呼び出しは無視されます。`
    : '';

  return new Agent({
    name: `${persona.name || 'iAgent'}-Heartbeat`,
    instructions: instructions + mcpToolNote,
    model: 'gpt-5-nano',
    tools: [calendarTool, deviceInfoTool],
    mcpServers: filteredMcpServers && filteredMcpServers.length > 0 ? filteredMcpServers : undefined,
  });
}
