import { useState, useCallback, useRef, useEffect } from 'react';
import { run, user } from '@openai/agents';
import { setDefaultOpenAIClient } from '@openai/agents-openai';
import OpenAI from 'openai';
import type { AgentInputItem, RunStreamEvent } from '@openai/agents';
import { createAgent } from '../core/agent';
import { getConfigValue } from '../core/config';
import { mcpManager } from '../core/mcpManager';
import { loadMessages, saveMessage } from '../store/conversationStore';
import { tracer } from '../telemetry/tracer';
import { LLM_ATTRS, TOOL_ATTRS } from '../telemetry/semantics';
import type { ChatMessage, ToolCallInfo } from '../types';

function ensureOpenAIClient(apiKey: string): void {
  const client = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
  setDefaultOpenAIClient(client);
}

export function useAgentChat(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<ToolCallInfo[]>([]);
  const historyRef = useRef<AgentInputItem[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentConvIdRef = useRef<string | null>(null);

  // conversationId 変更時にメッセージをリロード
  useEffect(() => {
    currentConvIdRef.current = conversationId;
    if (!conversationId) {
      setMessages([]);
      historyRef.current = [];
      return;
    }
    loadMessages(conversationId).then((saved) => {
      // 切替中に conversationId が変わった場合は無視
      if (currentConvIdRef.current !== conversationId) return;
      setMessages(saved);
      historyRef.current = [];
    });
  }, [conversationId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming || !conversationId) return;

    const apiKey = getConfigValue('openaiApiKey');
    if (!apiKey) {
      throw new Error('OpenAI APIキーが設定されていません');
    }

    ensureOpenAIClient(apiKey);

    // ユーザーメッセージ追加
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      conversationId,
    };
    setMessages((prev) => [...prev, userMsg]);
    await saveMessage(userMsg);

    // アシスタントメッセージ（ストリーミング用）
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
      conversationId,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    setIsStreaming(true);
    setActiveTools([]);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const trace = tracer.startTrace('agent.chat');
    trace.rootSpan.setAttribute(LLM_ATTRS.SYSTEM, 'openai');
    trace.rootSpan.setAttribute(LLM_ATTRS.MODEL, 'gpt-5-mini');

    let fullText = '';
    const toolCalls: ToolCallInfo[] = [];

    try {
      const mcpServers = mcpManager.getActiveServers();
      const agent = await createAgent(mcpServers, text);
      historyRef.current.push(user(text));

      const result = await run(agent, historyRef.current, {
        stream: true,
        signal: abortController.signal,
      });
      let currentToolSpan: ReturnType<typeof trace.startSpan> | null = null;

      for await (const event of result as AsyncIterable<RunStreamEvent>) {
        if (abortController.signal.aborted) break;

        if (event.type === 'raw_model_stream_event') {
          const data = event.data;
          // response_done イベントから usage 取得
          if (data.type === 'response_done' && 'response' in data) {
            const resp = (data as { response?: { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } } }).response;
            if (resp?.usage) {
              if (resp.usage.input_tokens != null) trace.rootSpan.setAttribute(LLM_ATTRS.USAGE_INPUT, resp.usage.input_tokens);
              if (resp.usage.output_tokens != null) trace.rootSpan.setAttribute(LLM_ATTRS.USAGE_OUTPUT, resp.usage.output_tokens);
              if (resp.usage.total_tokens != null) trace.rootSpan.setAttribute(LLM_ATTRS.USAGE_TOTAL, resp.usage.total_tokens);
            }
          }
          if (data.type === 'output_text_delta' && 'delta' in data) {
            fullText += (data as { delta: string }).delta;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.id === assistantMsg.id) {
                updated[updated.length - 1] = { ...last, content: fullText };
              }
              return updated;
            });
          }
        } else if (event.type === 'run_item_stream_event') {
          if (event.name === 'tool_called') {
            const item = event.item;
            const rawItem = item.rawItem as { id?: string; name?: string; arguments?: string } | undefined;
            const toolName = rawItem?.name ?? 'unknown';
            const toolCall: ToolCallInfo = {
              id: rawItem?.id ?? crypto.randomUUID(),
              name: toolName,
              status: 'running',
              args: rawItem?.arguments,
            };
            toolCalls.push(toolCall);
            setActiveTools([...toolCalls]);
            // ツールスパン開始
            currentToolSpan = trace.startSpan(`tool.${toolName}`, trace.rootSpan.spanId, 'client');
            currentToolSpan.setAttribute(TOOL_ATTRS.NAME, toolName);
            if (rawItem?.arguments) {
              currentToolSpan.setAttribute(TOOL_ATTRS.ARGUMENTS, rawItem.arguments);
            }
          } else if (event.name === 'tool_output') {
            const lastTool = toolCalls[toolCalls.length - 1];
            if (lastTool) {
              lastTool.status = 'completed';
              const rawOutput = event.item?.rawItem as { output?: unknown } | undefined;
              const output = rawOutput?.output;
              lastTool.result = typeof output === 'string' ? output : output != null ? JSON.stringify(output) : undefined;
              setActiveTools([...toolCalls]);
            }
            // ツールスパン終了
            if (currentToolSpan) {
              const resultStr = lastTool?.result;
              if (resultStr) {
                currentToolSpan.setAttribute(TOOL_ATTRS.RESULT_SIZE_BYTES, new Blob([resultStr]).size);
              }
              trace.endSpan(currentToolSpan);
              currentToolSpan = null;
            }
          }
        }
      }

      // abort されていなければ completed を待つ
      if (!abortController.signal.aborted) {
        await (result as { completed: Promise<void> }).completed;
      }

      // 履歴更新（abort 時も取得可能な範囲で更新）
      historyRef.current = (result as { history: AgentInputItem[] }).history;

      // 最終出力でメッセージを更新（ストリームで取りきれなかった場合のフォールバック）
      if (!abortController.signal.aborted) {
        const finalOutput = (result as { finalOutput?: unknown }).finalOutput;
        if (typeof finalOutput === 'string' && finalOutput.length > fullText.length) {
          fullText = finalOutput;
        }
      }

      const finalMsg: ChatMessage = {
        ...assistantMsg,
        content: fullText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      setMessages((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((m) => m.id === assistantMsg.id);
        if (idx >= 0) updated[idx] = finalMsg;
        return updated;
      });
      await saveMessage(finalMsg);
    } catch (error) {
      // AbortError は正常停止 — 中断時点のテキストでメッセージを確定・保存
      if (error instanceof DOMException && error.name === 'AbortError') {
        const abortedMsg: ChatMessage = {
          ...assistantMsg,
          content: fullText,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        };
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === assistantMsg.id);
          if (idx >= 0) updated[idx] = abortedMsg;
          return updated;
        });
        await saveMessage(abortedMsg);
        return;
      }
      const errorText = error instanceof Error ? error.message : '不明なエラーが発生しました';
      const errorMsg: ChatMessage = {
        ...assistantMsg,
        content: `エラー: ${errorText}`,
      };
      setMessages((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((m) => m.id === assistantMsg.id);
        if (idx >= 0) updated[idx] = errorMsg;
        return updated;
      });
      await saveMessage(errorMsg);
      trace.rootSpan.endWithError(error);
    } finally {
      abortControllerRef.current = null;
      await trace.finish().catch(() => {});
      setIsStreaming(false);
      setActiveTools([]);
    }
  }, [isStreaming, conversationId]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    historyRef.current = [];
  }, []);

  return { messages, isStreaming, activeTools, sendMessage, stopStreaming, clearChat, setMessages };
}
