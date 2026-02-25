import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockListTools = vi.fn();
const mockCallTool = vi.fn();

const mockClient = {
  connect: mockConnect,
  close: mockClose,
  listTools: mockListTools,
  callTool: mockCallTool,
};

const mockTerminateSession = vi.fn().mockResolvedValue(undefined);
const mockTransportClose = vi.fn().mockResolvedValue(undefined);
let mockSessionId: string | undefined = undefined;

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => mockClient),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({
    get sessionId() {
      return mockSessionId;
    },
    terminateSession: mockTerminateSession,
    close: mockTransportClose,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsResultSchema: {
    parse: (v: unknown) => v,
  },
  CallToolResultSchema: {
    parse: (v: unknown) => v,
  },
}));

import { BrowserMCPServer } from './mcpClient';

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionId = undefined;
});

describe('BrowserMCPServer', () => {
  it('name プロパティが正しく返る', () => {
    const server = new BrowserMCPServer({ name: 'test-server', url: 'http://localhost:3000' });
    expect(server.name).toBe('test-server');
  });

  describe('URL バリデーション', () => {
    it('HTTPS URL を受け入れる', () => {
      expect(() => new BrowserMCPServer({ name: 'test', url: 'https://example.com/mcp' })).not.toThrow();
    });

    it('localhost の HTTP URL を受け入れる', () => {
      expect(() => new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' })).not.toThrow();
    });

    it('非 localhost の HTTP URL を拒否する', () => {
      expect(() => new BrowserMCPServer({ name: 'test', url: 'http://example.com/mcp' })).toThrow(
        'https: プロトコルが必要です'
      );
    });

    it('不正な URL を拒否する', () => {
      expect(() => new BrowserMCPServer({ name: 'test', url: 'not-a-url' })).toThrow(
        'URL の形式が正しくありません'
      );
    });
  });

  describe('connect', () => {
    it('transport + client が初期化される', async () => {
      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      await server.connect();
      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it('client.connect 失敗時に close して再スローする', async () => {
      mockConnect.mockRejectedValueOnce(new Error('接続失敗'));
      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });

      await expect(server.connect()).rejects.toThrow('接続失敗');
      // close が呼ばれてクリーンアップされる
      expect(mockTransportClose).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('sessionId ありで terminateSession を呼び出す', async () => {
      mockSessionId = 'session-123';
      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      await server.connect();

      await server.close();
      expect(mockTerminateSession).toHaveBeenCalledOnce();
      expect(mockTransportClose).toHaveBeenCalled();
    });

    it('sessionId なしで terminateSession を呼ばない', async () => {
      mockSessionId = undefined;
      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      await server.connect();

      await server.close();
      expect(mockTerminateSession).not.toHaveBeenCalled();
      expect(mockTransportClose).toHaveBeenCalled();
    });

    it('connect 前でも安全に呼べる', async () => {
      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      await expect(server.close()).resolves.toBeUndefined();
    });
  });

  describe('listTools', () => {
    it('未接続でエラーを投げる', async () => {
      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      await expect(server.listTools()).rejects.toThrow('Server not initialized');
    });

    it('初回は SDK 呼び出し、2回目はキャッシュを返す', async () => {
      const mockTools = { tools: [{ name: 'tool1', description: 'desc', inputSchema: {} }] };
      mockListTools.mockResolvedValue(mockTools);

      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      await server.connect();

      const first = await server.listTools();
      const second = await server.listTools();

      expect(first).toEqual(mockTools.tools);
      expect(second).toEqual(mockTools.tools);
      // SDK は 1 回しか呼ばれない
      expect(mockListTools).toHaveBeenCalledTimes(1);
    });

    it('cacheToolsList=false で毎回 SDK を呼び出す', async () => {
      const mockTools = { tools: [{ name: 'tool1', description: 'desc', inputSchema: {} }] };
      mockListTools.mockResolvedValue(mockTools);

      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      server.cacheToolsList = false;
      await server.connect();

      await server.listTools();
      await server.listTools();

      expect(mockListTools).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidateToolsCache', () => {
    it('キャッシュ無効化後に再取得する', async () => {
      const mockTools = { tools: [{ name: 'tool1', description: 'desc', inputSchema: {} }] };
      mockListTools.mockResolvedValue(mockTools);

      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      await server.connect();

      await server.listTools(); // キャッシュ作成
      expect(mockListTools).toHaveBeenCalledTimes(1);

      await server.invalidateToolsCache();
      await server.listTools(); // 再取得
      expect(mockListTools).toHaveBeenCalledTimes(2);
    });
  });

  describe('callTool', () => {
    it('未接続でエラーを投げる', async () => {
      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      await expect(server.callTool('tool1', {})).rejects.toThrow('Server not initialized');
    });

    it('args が正しく伝搬され、null は {} に変換される', async () => {
      const mockResult = { content: [{ type: 'text', text: 'result' }] };
      mockCallTool.mockResolvedValue(mockResult);

      const server = new BrowserMCPServer({ name: 'test', url: 'http://localhost:3000' });
      await server.connect();

      // null args
      await server.callTool('tool1', null);
      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool1',
        arguments: {},
      });

      // explicit args
      mockCallTool.mockClear();
      await server.callTool('tool2', { key: 'value' });
      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool2',
        arguments: { key: 'value' },
      });
    });
  });
});
