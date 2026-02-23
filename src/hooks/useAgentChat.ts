import { useState, useCallback, useRef } from 'react';
import { run, user } from '@openai/agents';
import { setDefaultOpenAIClient } from '@openai/agents-openai';
import OpenAI from 'openai';
import type { AgentInputItem, RunStreamEvent } from '@openai/agents';
import { createAgent } from '../core/agent';
import { getConfigValue } from '../core/config';
import { mcpManager } from '../core/mcpManager';
import { saveMessage } from '../store/conversationStore';
import type { ChatMessage, ToolCallInfo } from '../types';

function ensureOpenAIClient(apiKey: string): void {
  const client = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
  setDefaultOpenAIClient(client);
}

export function useAgentChat(initialMessages: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<ToolCallInfo[]>([]);
  const historyRef = useRef<AgentInputItem[]>([]);
  const abortRef = useRef(false);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

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
    };
    setMessages((prev) => [...prev, assistantMsg]);

    setIsStreaming(true);
    setActiveTools([]);
    abortRef.current = false;

    try {
      const mcpServers = mcpManager.getActiveServers();
      const agent = await createAgent(mcpServers);
      historyRef.current.push(user(text));

      const result = await run(agent, historyRef.current, {
        stream: true,
      });

      let fullText = '';
      const toolCalls: ToolCallInfo[] = [];

      for await (const event of result as AsyncIterable<RunStreamEvent>) {
        if (abortRef.current) break;

        if (event.type === 'raw_model_stream_event') {
          const data = event.data;
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
            const toolCall: ToolCallInfo = {
              id: rawItem?.id ?? crypto.randomUUID(),
              name: rawItem?.name ?? 'unknown',
              status: 'running',
              args: rawItem?.arguments,
            };
            toolCalls.push(toolCall);
            setActiveTools([...toolCalls]);
          } else if (event.name === 'tool_output') {
            const lastTool = toolCalls[toolCalls.length - 1];
            if (lastTool) {
              lastTool.status = 'completed';
              const rawOutput = event.item?.rawItem as { output?: string } | undefined;
              lastTool.result = rawOutput?.output;
              setActiveTools([...toolCalls]);
            }
          }
        }
      }

      await (result as { completed: Promise<void> }).completed;

      // 履歴更新
      historyRef.current = (result as { history: AgentInputItem[] }).history;

      // 最終出力でメッセージを更新（ストリームで取りきれなかった場合のフォールバック）
      const finalOutput = (result as { finalOutput?: unknown }).finalOutput;
      if (typeof finalOutput === 'string' && finalOutput.length > fullText.length) {
        fullText = finalOutput;
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
      const errorText = error instanceof Error ? error.message : '不明なエラーが発生しました';
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.id === assistantMsg.id) {
          updated[updated.length - 1] = { ...last, content: `エラー: ${errorText}` };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
      setActiveTools([]);
    }
  }, [isStreaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current = true;
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    historyRef.current = [];
  }, []);

  return { messages, isStreaming, activeTools, sendMessage, stopStreaming, clearChat, setMessages };
}
