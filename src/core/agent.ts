import { Agent } from '@openai/agents';
import type { MCPServer } from '@openai/agents';
import { calendarTool } from '../tools/calendarTool';
import { webSearchTool } from '../tools/webSearchTool';
import { deviceInfoTool } from '../tools/deviceInfoTool';
import { memoryTool } from '../tools/memoryTool';
import { getRecentMemories } from '../store/memoryStore';

export async function createAgent(mcpServers?: MCPServer[]): Promise<Agent> {
  const memories = await getRecentMemories(10);
  const memoryContext = memories.length > 0
    ? `\n\n## あなたの記憶\n以下はこれまでに保存した重要な情報です:\n${memories.map((m) => `- [${m.category}] ${m.content}`).join('\n')}`
    : '';

  return new Agent({
    name: 'iAgent',
    instructions: `あなたはiAgentです。ブラウザ上で動作するパーソナルAIアシスタントです。
ユーザーの質問に答え、必要に応じてツールを使用してタスクを実行します。
ツールの結果を受け取ったら、ユーザーにわかりやすく日本語で説明してください。
日付や時刻に関する操作では、ユーザーのローカルタイムゾーンを考慮してください。
現在の日時: ${new Date().toLocaleString('ja-JP')}

## メモリについて
ユーザーとの会話で重要な情報（好み、事実、文脈）を発見したら、memory ツールの save アクションで保存してください。
既に保存済みの情報を更新する場合は、古いメモリを delete してから新しい内容で save してください。${memoryContext}`,
    model: 'gpt-5-mini',
    tools: [calendarTool, webSearchTool, deviceInfoTool, memoryTool],
    mcpServers: mcpServers && mcpServers.length > 0 ? mcpServers : undefined,
  });
}

export async function createHeartbeatAgent(mcpServers?: MCPServer[]): Promise<Agent> {
  const memories = await getRecentMemories(5);
  const memoryContext = memories.length > 0
    ? `\n\nユーザーについての記憶:\n${memories.map((m) => `- [${m.category}] ${m.content}`).join('\n')}`
    : '';

  return new Agent({
    name: 'iAgent-Heartbeat',
    instructions: `あなたはiAgentのバックグラウンドチェッカーです。
与えられたタスクに基づいて定期チェックを実行し、結果をJSON形式で返してください。

必ず以下のJSON形式で回答してください（他のテキストは含めないでください）:
{
  "results": [
    {
      "taskId": "タスクID",
      "hasChanges": true/false,
      "summary": "変化の要約（変化がない場合は空文字列）"
    }
  ]
}

現在の日時: ${new Date().toLocaleString('ja-JP')}
ルール:
- hasChanges が false の場合、summary は空文字列にしてください
- 通知する価値がある情報のみ hasChanges: true にしてください
- 日本語で summary を書いてください${memoryContext}`,
    model: 'gpt-5-nano',
    tools: [calendarTool, deviceInfoTool],
    mcpServers: mcpServers && mcpServers.length > 0 ? mcpServers : undefined,
  });
}
