import { Agent } from '@openai/agents';
import { calendarTool } from '../tools/calendarTool';
import { webSearchTool } from '../tools/webSearchTool';
import { deviceInfoTool } from '../tools/deviceInfoTool';

export const createAgent = () => new Agent({
  name: 'iAgent',
  instructions: `あなたはiAgentです。ブラウザ上で動作するパーソナルAIアシスタントです。
ユーザーの質問に答え、必要に応じてツールを使用してタスクを実行します。
ツールの結果を受け取ったら、ユーザーにわかりやすく日本語で説明してください。
日付や時刻に関する操作では、ユーザーのローカルタイムゾーンを考慮してください。
現在の日時: ${new Date().toLocaleString('ja-JP')}`,
  model: 'gpt-4o',
  tools: [calendarTool, webSearchTool, deviceInfoTool],
});
