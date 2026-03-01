import { WORKER_TOOLS, executeWorkerTool } from './heartbeatTools';
import { buildWorkerHeartbeatPrompt } from './instructionBuilder';
import { getDefaultPersonaConfig } from './config';
import type { HeartbeatResult, HeartbeatTask, CalendarEvent, Memory, PersonaConfig } from '../types';

const OPENAI_API_URL = import.meta.env.VITE_OPENAI_API_URL
  || 'https://api.openai.com/v1/chat/completions';
const MAX_TOOL_ROUNDS = 5;
const FETCH_TIMEOUT_MS = 90_000; // 90秒タイムアウト

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
}

/** fetch ベースで OpenAI Chat Completions API を呼び出す */
export async function callChatCompletions(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools?: typeof WORKER_TOOLS,
): Promise<ChatCompletionResponse> {
  const body: Record<string, unknown> = {
    model,
    messages,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API エラー (${response.status}): ${errorText}`);
    }

    let data: ChatCompletionResponse;
    try {
      data = await response.json();
    } catch (jsonError: unknown) {
      throw new Error(
        `OpenAI API レスポンスの JSON 解析に失敗: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`OpenAI API タイムアウト (${FETCH_TIMEOUT_MS / 1000}秒)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Heartbeat 用システムプロンプトを構築する */
function buildSystemPrompt(memories: Memory[], persona?: PersonaConfig): string {
  return buildWorkerHeartbeatPrompt({
    persona: persona ?? getDefaultPersonaConfig(),
    memories,
    currentDateTime: new Date().toLocaleString('ja-JP'),
    isHeartbeat: true,
  });
}

/** Worker 内で Heartbeat チェックを実行する（DOM/localStorage 非依存） */
export async function executeWorkerHeartbeatCheck(
  apiKey: string,
  tasks: HeartbeatTask[],
  calendarEvents: CalendarEvent[],
  memories: Memory[],
  persona?: PersonaConfig,
): Promise<HeartbeatResult[]> {
  const systemPrompt = buildSystemPrompt(memories, persona);
  const taskDescriptions = tasks.map((t) =>
    `- タスクID: ${t.id}, タスク名: ${t.name}, 内容: ${t.description}`
  ).join('\n');

  const calendarContext = calendarEvents.length > 0
    ? `\n\n現在のカレンダーイベント:\n${calendarEvents.map((e) => `- ${e.date}${e.time ? ' ' + e.time : ''}: ${e.title}${e.description ? '（' + e.description + '）' : ''}`).join('\n')}`
    : '';

  const userMessage = `以下のタスクについてチェックを実行してください:\n${taskDescriptions}${calendarContext}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  console.debug('[Heartbeat] tool calling 開始 — タスク:', tasks.map(t => t.id).join(', '));

  // tool calling ループ（最大 MAX_TOOL_ROUNDS 回）
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callChatCompletions(apiKey, 'gpt-5-nano', messages, WORKER_TOOLS);
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('OpenAI API からレスポンスが空です');
    }

    const assistantMessage = choice.message;

    // tool_calls がなければ最終レスポンス
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      console.debug(`[Heartbeat] ラウンド ${round + 1}/${MAX_TOOL_ROUNDS} — 最終レスポンス（ツール呼び出しなし）`);
      return parseHeartbeatResponse(assistantMessage.content);
    }

    const toolNames = assistantMessage.tool_calls.map(tc => tc.function.name);
    console.debug(`[Heartbeat] ラウンド ${round + 1}/${MAX_TOOL_ROUNDS} — ツール呼び出し:`, toolNames.join(', '));

    // assistant メッセージを履歴に追加
    messages.push({
      role: 'assistant',
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls,
    });

    // 各ツール呼び出しを実行
    for (const toolCall of assistantMessage.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        // パース失敗時は空オブジェクト
      }
      const result = await executeWorkerTool(toolCall.function.name, args);
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });
    }
  }

  // ループ上限を超えた場合は最後のレスポンスを試みる
  console.warn(`[Heartbeat] ツール呼び出しラウンド上限（${MAX_TOOL_ROUNDS}）に到達`);
  const finalResponse = await callChatCompletions(apiKey, 'gpt-5-nano', messages);
  const finalChoice = finalResponse.choices[0];
  return parseHeartbeatResponse(finalChoice?.message?.content);
}

/** レスポンスから HeartbeatResult[] をパースする */
function parseHeartbeatResponse(content: string | null | undefined): HeartbeatResult[] {
  if (!content) return [];

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as {
    results: Array<{ taskId: string; hasChanges: boolean; summary: string }>;
  };

  const now = Date.now();
  return parsed.results.map((r) => ({
    taskId: r.taskId,
    timestamp: now,
    hasChanges: r.hasChanges,
    summary: r.summary || '',
  }));
}
