import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __resetStores } from '../store/__mocks__/db';

vi.mock('../store/db');

// configStore モック
vi.mock('../store/configStore', () => ({
  saveConfigToIDB: vi.fn().mockResolvedValue(undefined),
}));

import { callChatCompletions, executeWorkerHeartbeatCheck, parseHeartbeatResponse } from './heartbeatOpenAI';
import type { HeartbeatTask, Memory, PersonaConfig } from '../types';

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

    const { results, configChanged } = await executeWorkerHeartbeatCheck('sk-test', tasks, [], memories);

    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe('calendar-check');
    expect(results[0].hasChanges).toBe(false);
    expect(configChanged).toBe(false);
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

    const { results } = await executeWorkerHeartbeatCheck('sk-test', tasks, [], memories);

    expect(results).toHaveLength(1);
    expect(results[0].hasChanges).toBe(true);
    expect(results[0].summary).toBe('会議が近い');
    // fetch が 2 回呼ばれた（tool call + 最終）
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('メモリが含まれるとシステムプロンプトに注入される', async () => {
    const memoryList: Memory[] = [
      { id: '1', content: 'ユーザーは朝が苦手', category: 'preference', importance: 3, tags: [], createdAt: 0, updatedAt: 0 },
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

  it('persona が反映される', async () => {
    const persona: PersonaConfig = {
      name: 'TestBot',
      personality: '冷静沈着',
      tone: '',
      customInstructions: '',
    };
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

    await executeWorkerHeartbeatCheck('sk-test', tasks, [], [], persona);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMsg.content).toContain('TestBot');
    expect(systemMsg.content).toContain('冷静沈着');
  });

  it('persona 未指定時はデフォルトの iAgent が使われる', async () => {
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

    await executeWorkerHeartbeatCheck('sk-test', tasks, [], []);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMsg.content).toContain('iAgent');
  });

  it('content が空の場合は空配列を返す', async () => {
    const apiResponse = {
      choices: [{
        message: { role: 'assistant', content: null },
        finish_reason: 'stop',
      }],
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) });

    const { results } = await executeWorkerHeartbeatCheck('sk-test', tasks, [], memories);
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

    const { results } = await executeWorkerHeartbeatCheck('sk-test', tasks, [], memories);
    expect(results).toEqual([]);
  });

  it('不正な JSON でもクラッシュせず空配列を返す', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const apiResponse = {
      choices: [{
        message: { role: 'assistant', content: '{ invalid json }' },
        finish_reason: 'stop',
      }],
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) });

    const { results } = await executeWorkerHeartbeatCheck('sk-test', tasks, [], memories);
    expect(results).toEqual([]);
    warnSpy.mockRestore();
  });
});

describe('parseHeartbeatResponse', () => {
  it('正常な JSON をパースする', () => {
    const content = JSON.stringify({
      results: [{ taskId: 'test', hasChanges: true, summary: 'OK' }],
    });
    const results = parseHeartbeatResponse(content);
    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe('test');
    expect(results[0].hasChanges).toBe(true);
    expect(results[0].summary).toBe('OK');
  });

  it('null content で空配列を返す', () => {
    expect(parseHeartbeatResponse(null)).toEqual([]);
  });

  it('不正な JSON で空配列を返す', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseHeartbeatResponse('{ broken json }')).toEqual([]);
    warnSpy.mockRestore();
  });

  it('results が配列でない場合に空配列を返す', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseHeartbeatResponse('{ "results": "not-array" }')).toEqual([]);
    warnSpy.mockRestore();
  });

  it('taskId が欠落した要素をフィルタする', () => {
    const content = JSON.stringify({
      results: [
        { taskId: 'valid', hasChanges: false, summary: '' },
        { hasChanges: true, summary: 'no taskId' },
        null,
      ],
    });
    const results = parseHeartbeatResponse(content);
    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe('valid');
  });

  it('hasChanges 未定義の場合に false を返す', () => {
    const content = JSON.stringify({
      results: [{ taskId: 'test' }],
    });
    const results = parseHeartbeatResponse(content);
    expect(results).toHaveLength(1);
    expect(results[0].hasChanges).toBe(false);
    expect(results[0].summary).toBe('');
  });
});
