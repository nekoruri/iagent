import { Agent } from '@openai/agents';
import type { MCPServer } from '@openai/agents';
import { calendarTool } from '../tools/calendarTool';
import { webSearchTool } from '../tools/webSearchTool';
import { deviceInfoTool } from '../tools/deviceInfoTool';
import { memoryTool } from '../tools/memoryTool';
import { clipTool } from '../tools/clipTool';
import { feedTool } from '../tools/feedTool';
import { webMonitorTool } from '../tools/webMonitorTool';
import { getRelevantMemories, getMemoriesForBriefing } from '../store/memoryStore';
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
  tasks?: Array<{ id: string }>,
): Promise<Agent> {
  const config = getConfig();
  const persona = config.persona ?? getDefaultPersonaConfig();
  const hasBriefing = tasks?.some((t) => t.id.startsWith('briefing-'));
  const memories = hasBriefing
    ? await getMemoriesForBriefing(15)
    : await getRelevantMemories('', 5);
  const instructions = buildHeartbeatInstructions({
    persona,
    memories,
    currentDateTime: new Date().toLocaleString('ja-JP'),
    isHeartbeat: true,
  });

  // MCP ツールが指定されていない場合は MCP サーバーを渡さない
  // SDK レベルの callable toolFilter でサーバー名+ツール名を検証（プロンプト記述 + SDK フィルタの二重防御）
  // allowedMcpToolNames は "serverName/toolName" 形式。"/" なしはレガシー互換（任意サーバーにマッチ）
  const filteredMcpServers = allowedMcpToolNames && allowedMcpToolNames.length > 0
    ? mcpServers?.map((server) =>
      Object.assign(Object.create(Object.getPrototypeOf(server)), server, {
        toolFilter: async (
          context: { serverName: string },
          tool: { name: string },
        ) => {
          return allowedMcpToolNames.some((entry) => {
            const sep = entry.indexOf('/');
            if (sep >= 0) {
              // qualified: "serverName/toolName"
              return entry.slice(0, sep) === context.serverName
                && entry.slice(sep + 1) === tool.name;
            }
            // レガシー: "toolName" のみ → 任意サーバーにマッチ
            return entry === tool.name;
          });
        },
      }),
    )
    : undefined;

  const mcpToolNote = allowedMcpToolNames && allowedMcpToolNames.length > 0
    ? `\n\n## MCP ツール使用制限\n利用可能な MCP ツール: ${allowedMcpToolNames.map((e) => {
        const sep = e.indexOf('/');
        return sep >= 0 ? `${e.slice(sep + 1)} (${e.slice(0, sep)})` : e;
      }).join(', ')}\n【重要】上記リスト以外の MCP ツールを呼び出さないでください。許可されていないツール呼び出しは無視されます。`
    : '';

  return new Agent({
    name: `${persona.name || 'iAgent'}-Heartbeat`,
    instructions: instructions + mcpToolNote,
    model: 'gpt-5-nano',
    tools: [calendarTool, deviceInfoTool],
    mcpServers: filteredMcpServers && filteredMcpServers.length > 0 ? filteredMcpServers : undefined,
  });
}
