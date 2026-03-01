import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentChat } from './useAgentChat';

// --- モック定義 ---

const mockRun = vi.fn();
const mockSetDefaultOpenAIClient = vi.fn();

vi.mock('@openai/agents', () => ({
  run: (...args: unknown[]) => mockRun(...args),
  user: (text: string) => ({ role: 'user', content: text }),
}));

vi.mock('@openai/agents-openai', () => ({
  setDefaultOpenAIClient: (...args: unknown[]) => mockSetDefaultOpenAIClient(...args),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({})),
}));

const mockCreateAgent = vi.fn().mockResolvedValue({ name: 'test-agent' });
vi.mock('../core/agent', () => ({
  createAgent: (...args: unknown[]) => mockCreateAgent(...args),
}));

const mockGetConfigValue = vi.fn();
vi.mock('../core/config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
}));

vi.mock('../core/mcpManager', () => ({
  mcpManager: { getActiveServers: () => [] },
}));

const mockLoadMessages = vi.fn();
const mockSaveMessage = vi.fn();
vi.mock('../store/conversationStore', () => ({
  loadMessages: (...args: unknown[]) => mockLoadMessages(...args),
  saveMessage: (...args: unknown[]) => mockSaveMessage(...args),
}));

// テレメトリモック
const mockSpan = {
  setAttribute: vi.fn(),
  endWithError: vi.fn(),
  spanId: 'span-1',
};
const mockTrace = {
  rootSpan: mockSpan,
  startSpan: vi.fn().mockReturnValue({ ...mockSpan, spanId: 'tool-span-1' }),
  endSpan: vi.fn(),
  finish: vi.fn().mockResolvedValue(undefined),
};
vi.mock('../telemetry/tracer', () => ({
  tracer: { startTrace: () => mockTrace },
}));
vi.mock('../telemetry/semantics', () => ({
  LLM_ATTRS: { SYSTEM: 'llm.system', MODEL: 'llm.model', USAGE_INPUT: 'usage.input', USAGE_OUTPUT: 'usage.output', USAGE_TOTAL: 'usage.total' },
  TOOL_ATTRS: { NAME: 'tool.name', ARGUMENTS: 'tool.arguments', RESULT_SIZE_BYTES: 'tool.result_size' },
}));

// --- ヘルパー ---

/** AsyncIterable なストリームイベントを生成する */
function createMockStream(events: Array<Record<string, unknown>>) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    },
    completed: Promise.resolve(),
    history: [],
    finalOutput: '',
  };
}

/** テキスト delta イベント */
function textDelta(delta: string) {
  return {
    type: 'raw_model_stream_event',
    data: { type: 'output_text_delta', delta },
  };
}

/** response_done イベント */
function responseDone(usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }) {
  return {
    type: 'raw_model_stream_event',
    data: { type: 'response_done', response: { usage } },
  };
}

/** tool_called イベント */
function toolCalled(name: string, args?: string) {
  return {
    type: 'run_item_stream_event',
    name: 'tool_called',
    item: { rawItem: { id: `call-${name}`, name, arguments: args } },
  };
}

/** tool_output イベント */
function toolOutput(output: string) {
  return {
    type: 'run_item_stream_event',
    name: 'tool_output',
    item: { rawItem: { output } },
  };
}

/** フック初期化 + 初回ロード完了を待つ */
async function setupHook(conversationId: string | null) {
  const hook = renderHook(() => useAgentChat(conversationId));
  // 初回マウント時の loadMessages useEffect を完了させる
  await act(async () => {
    await Promise.resolve();
  });
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfigValue.mockReturnValue('sk-test-key');
  mockLoadMessages.mockResolvedValue([]);
  mockSaveMessage.mockResolvedValue(undefined);

  // crypto.randomUUID のモック
  let uuidCounter = 0;
  vi.stubGlobal('crypto', {
    ...crypto,
    randomUUID: () => `uuid-${++uuidCounter}`,
  });
});

describe('useAgentChat', () => {
  // --- 初期状態 ---
  it('初期状態は空のメッセージ配列', () => {
    const { result } = renderHook(() => useAgentChat('conv-1'));
    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.activeTools).toEqual([]);
  });

  // --- conversationId 変更 ---
  describe('conversationId 変更', () => {
    it('conversationId が変わるとメッセージをリロードする', async () => {
      const saved = [{ id: 'm1', role: 'user' as const, content: 'こんにちは', timestamp: 1000 }];
      mockLoadMessages.mockResolvedValue(saved);

      const { result } = renderHook(() => useAgentChat('conv-1'));

      await vi.waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });
      expect(result.current.messages[0].content).toBe('こんにちは');
    });

    it('conversationId が null の場合はメッセージをリセットする', () => {
      const { result } = renderHook(() => useAgentChat(null));
      expect(result.current.messages).toEqual([]);
    });
  });

  // --- sendMessage ---
  describe('sendMessage', () => {
    it('テキストストリーミングを受信してメッセージを更新する', async () => {
      const stream = createMockStream([
        textDelta('Hello'),
        textDelta(' World'),
        responseDone({ input_tokens: 10, output_tokens: 5, total_tokens: 15 }),
      ]);
      stream.finalOutput = 'Hello World';
      mockRun.mockResolvedValue(stream);

      const { result } = await setupHook('conv-1');

      await act(async () => {
        await result.current.sendMessage('テスト');
      });

      // ユーザーメッセージ + アシスタントメッセージ
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('テスト');
      expect(result.current.messages[1].role).toBe('assistant');
      expect(result.current.messages[1].content).toBe('Hello World');

      // saveMessage がユーザー・アシスタント両方で呼ばれる
      expect(mockSaveMessage).toHaveBeenCalledTimes(2);

      // テレメトリに Usage が記録される
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('usage.input', 10);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('usage.output', 5);
    });

    it('空文字列の場合は送信しない', async () => {
      const { result } = await setupHook('conv-1');

      await act(async () => {
        await result.current.sendMessage('  ');
      });

      expect(mockRun).not.toHaveBeenCalled();
      expect(result.current.messages).toEqual([]);
    });

    it('conversationId が null の場合は送信しない', async () => {
      const { result } = await setupHook(null);

      await act(async () => {
        await result.current.sendMessage('テスト');
      });

      expect(mockRun).not.toHaveBeenCalled();
    });

    it('API キーが未設定の場合はエラーを投げる', async () => {
      mockGetConfigValue.mockReturnValue('');

      const { result } = await setupHook('conv-1');

      await expect(
        act(async () => {
          await result.current.sendMessage('テスト');
        }),
      ).rejects.toThrow('OpenAI APIキーが設定されていません');
    });

    it('ツール呼び出しを activeTools に反映する', async () => {
      const stream = createMockStream([
        toolCalled('calendar', '{"action":"list"}'),
        toolOutput('{"events":[]}'),
        textDelta('予定はありません'),
      ]);
      stream.finalOutput = '予定はありません';
      mockRun.mockResolvedValue(stream);

      const { result } = await setupHook('conv-1');

      await act(async () => {
        await result.current.sendMessage('予定を確認して');
      });

      // 完了後は activeTools がクリアされる
      expect(result.current.activeTools).toEqual([]);
      expect(result.current.isStreaming).toBe(false);

      // 最終メッセージに toolCalls が記録される
      const assistantMsg = result.current.messages[1];
      expect(assistantMsg.toolCalls).toHaveLength(1);
      expect(assistantMsg.toolCalls![0].name).toBe('calendar');
      expect(assistantMsg.toolCalls![0].status).toBe('completed');
      expect(assistantMsg.toolCalls![0].result).toBe('{"events":[]}');

      // テレメトリにツールスパンが記録される
      expect(mockTrace.startSpan).toHaveBeenCalledWith('tool.calendar', 'span-1', 'client');
      expect(mockTrace.endSpan).toHaveBeenCalled();
    });

    it('ストリーミングエラー時にエラーメッセージを表示する', async () => {
      mockRun.mockRejectedValue(new Error('API 接続エラー'));

      const { result } = await setupHook('conv-1');

      await act(async () => {
        await result.current.sendMessage('テスト');
      });

      // ユーザーメッセージ + エラーアシスタントメッセージ
      expect(result.current.messages).toHaveLength(2);
      const assistantMsg = result.current.messages[1];
      expect(assistantMsg.content).toBe('エラー: API 接続エラー');
      expect(result.current.isStreaming).toBe(false);

      // テレメトリにエラーが記録される
      expect(mockSpan.endWithError).toHaveBeenCalled();
    });

    it('Error 以外の例外も処理する', async () => {
      mockRun.mockRejectedValue('文字列エラー');

      const { result } = await setupHook('conv-1');

      await act(async () => {
        await result.current.sendMessage('テスト');
      });

      expect(result.current.messages).toHaveLength(2);
      const assistantMsg = result.current.messages[1];
      expect(assistantMsg.content).toBe('エラー: 不明なエラーが発生しました');
    });

    it('finalOutput が fullText より長い場合はフォールバックする', async () => {
      const stream = createMockStream([
        textDelta('短い'),
      ]);
      stream.finalOutput = '短いテキストの完全版です。ストリームで取りきれなかった部分も含みます。';
      mockRun.mockResolvedValue(stream);

      const { result } = await setupHook('conv-1');

      await act(async () => {
        await result.current.sendMessage('テスト');
      });

      expect(result.current.messages[1].content).toBe(stream.finalOutput);
    });
  });

  // --- stopStreaming ---
  describe('stopStreaming', () => {
    it('ストリーミングを中断する', async () => {
      // abort で break するストリームをシミュレート
      let yieldCount = 0;
      const stream = {
        [Symbol.asyncIterator]: async function* () {
          while (true) {
            yieldCount++;
            yield textDelta(`chunk-${yieldCount}`);
            await new Promise((r) => setTimeout(r, 0));
          }
        },
        completed: Promise.resolve(),
        history: [],
        finalOutput: '',
      };
      mockRun.mockResolvedValue(stream);

      const { result } = await setupHook('conv-1');

      // 送信開始（await しない — ストリーミング中に stopStreaming を呼ぶため）
      let sendPromise: Promise<void>;
      act(() => {
        sendPromise = result.current.sendMessage('テスト');
      });

      // ストリーミング開始を待つ
      await vi.waitFor(() => expect(result.current.isStreaming).toBe(true));

      // 中止
      act(() => result.current.stopStreaming());

      await act(async () => {
        await sendPromise!;
      });

      expect(result.current.isStreaming).toBe(false);
      // チャンクは少なくとも1つは受信されている
      expect(yieldCount).toBeGreaterThanOrEqual(1);
    });
  });

  // --- clearChat ---
  describe('clearChat', () => {
    it('メッセージをクリアする', async () => {
      const stream = createMockStream([textDelta('応答')]);
      stream.finalOutput = '応答';
      mockRun.mockResolvedValue(stream);

      const { result } = await setupHook('conv-1');

      await act(async () => {
        await result.current.sendMessage('テスト');
      });
      expect(result.current.messages).toHaveLength(2);

      act(() => result.current.clearChat());
      expect(result.current.messages).toEqual([]);
    });
  });

  // --- テレメトリ ---
  describe('テレメトリ', () => {
    it('trace.finish が常に呼ばれる（正常・エラー問わず）', async () => {
      const stream = createMockStream([textDelta('OK')]);
      stream.finalOutput = 'OK';
      mockRun.mockResolvedValue(stream);

      const { result } = await setupHook('conv-1');

      await act(async () => {
        await result.current.sendMessage('テスト');
      });

      expect(mockTrace.finish).toHaveBeenCalled();
    });
  });
});
