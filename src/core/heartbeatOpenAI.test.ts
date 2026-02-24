import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

import { callChatCompletions, executeWorkerHeartbeatCheck } from './heartbeatOpenAI';
import type { HeartbeatTask, Memory } from '../types';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  __resetStores();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('callChatCompletions', () => {
  it('正常レスポンスを返す', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await callChatCompletions('sk-test', 'gpt-5-nano', [
      { role: 'user', content: 'Hi' },
    ]);

    expect(result.choices[0].message.content).toBe('Hello');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test',
        }),
      }),
    );
  });

  it('ツール付きリクエストを送信する', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const tools = [
      { type: 'function' as const, function: { name: 'test', description: 'test', parameters: { type: 'object', properties: {} } } },
    ];

    await callChatCompletions('sk-test', 'gpt-5-nano', [{ role: 'user', content: 'test' }], tools);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tools).toBeDefined();
    expect(body.tools).toHaveLength(1);
  });

  it('API エラー時に例外を投げる', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    await expect(
      callChatCompletions('bad-key', 'gpt-5-nano', [{ role: 'user', content: 'test' }]),
    ).rejects.toThrow('OpenAI API エラー (401)');
  });
});

describe('executeWorkerHeartbeatCheck', () => {
  const tasks: HeartbeatTask[] = [
    { id: 'calendar-check', name: 'カレンダーチェック', description: '予定確認', enabled: true, type: 'builtin' },
  ];
  const memories: Memory[] = [];

  it('tool_calls なしで直接結果を返す', async () => {
    const apiResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: JSON.stringify({
            results: [{ taskId: 'calendar-check', hasChanges: false, summary: '' }],
          }),
        },
        finish_reason: 'stop',
      }],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    const results = await executeWorkerHeartbeatCheck('sk-test', tasks, [], memories);

    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe('calendar-check');
    expect(results[0].hasChanges).toBe(false);
  });

  it('tool_calls を処理してから最終結果を返す', async () => {
    // 1回目: tool_calls あり
    const firstResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'getCurrentTime', arguments: '{}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
    // 2回目: 最終結果
    const secondResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: JSON.stringify({
            results: [{ taskId: 'calendar-check', hasChanges: true, summary: '会議が近い' }],
          }),
        },
        finish_reason: 'stop',
      }],
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(firstResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(secondResponse) });

    const results = await executeWorkerHeartbeatCheck('sk-test', tasks, [], memories);

    expect(results).toHaveLength(1);
    expect(results[0].hasChanges).toBe(true);
    expect(results[0].summary).toBe('会議が近い');
    // fetch が 2 回呼ばれた（tool call + 最終）
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('メモリが含まれるとシステムプロンプトに注入される', async () => {
    const memoryList: Memory[] = [
      { id: '1', content: 'ユーザーは朝が苦手', category: 'preference', createdAt: 0, updatedAt: 0 },
    ];
    const apiResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: JSON.stringify({ results: [] }),
        },
        finish_reason: 'stop',
      }],
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) });

    await executeWorkerHeartbeatCheck('sk-test', tasks, [], memoryList);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMsg.content).toContain('ユーザーは朝が苦手');
  });

  it('content が空の場合は空配列を返す', async () => {
    const apiResponse = {
      choices: [{
        message: { role: 'assistant', content: null },
        finish_reason: 'stop',
      }],
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) });

    const results = await executeWorkerHeartbeatCheck('sk-test', tasks, [], memories);
    expect(results).toEqual([]);
  });

  it('JSON にマッチしない content の場合は空配列を返す', async () => {
    const apiResponse = {
      choices: [{
        message: { role: 'assistant', content: 'no json here' },
        finish_reason: 'stop',
      }],
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) });

    const results = await executeWorkerHeartbeatCheck('sk-test', tasks, [], memories);
    expect(results).toEqual([]);
  });
});
