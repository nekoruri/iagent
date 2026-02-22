import { Agent } from '@openai/agents';
import type { MCPServer } from '@openai/agents';
import { calendarTool } from '../tools/calendarTool';
import { webSearchTool } from '../tools/webSearchTool';
import { deviceInfoTool } from '../tools/deviceInfoTool';

export const createAgent = (mcpServers?: MCPServer[]) => new Agent({
  name: 'iAgent',
  instructions: `あなたはiAgentです。ブラウザ上で動作するパーソナルAIアシスタントです。
ユーザーの質問に答え、必要に応じてツールを使用してタスクを実行します。
ツールの結果を受け取ったら、ユーザーにわかりやすく日本語で説明してください。
日付や時刻に関する操作では、ユーザーのローカルタイムゾーンを考慮してください。
現在の日時: ${new Date().toLocaleString('ja-JP')}`,
  model: 'gpt-5-mini',
  tools: [calendarTool, webSearchTool, deviceInfoTool],
  mcpServers: mcpServers && mcpServers.length > 0 ? mcpServers : undefined,
});

export const createHeartbeatAgent = (mcpServers?: MCPServer[]) => new Agent({
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
- 日本語で summary を書いてください`,
  model: 'gpt-5-nano',
  tools: [calendarTool, deviceInfoTool],
  mcpServers: mcpServers && mcpServers.length > 0 ? mcpServers : undefined,
});
