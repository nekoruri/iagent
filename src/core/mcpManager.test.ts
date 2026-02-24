import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPManager } from './mcpManager';
import type { MCPServerConfig } from '../types';

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('./mcpClient', () => ({
  BrowserMCPServer: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
  })),
}));

function makeConfig(overrides?: Partial<MCPServerConfig>): MCPServerConfig {
  return {
    id: 'server-1',
    name: 'テストサーバー',
    url: 'http://localhost:3000/mcp',
    enabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MCPManager', () => {
  describe('connectServer', () => {
    it('接続成功で status=connected になる', async () => {
      const manager = new MCPManager();
      await manager.connectServer(makeConfig());

      expect(manager.getStatus('server-1')).toBe('connected');
    });

    it('接続失敗で status=error + エラーメッセージが設定される', async () => {
      mockConnect.mockRejectedValueOnce(new Error('接続拒否'));
      const manager = new MCPManager();
      await manager.connectServer(makeConfig());

      expect(manager.getStatus('server-1')).toBe('error');
      expect(manager.getError('server-1')).toBe('接続拒否');
    });

    it('既存接続を先に切断して再接続する', async () => {
      const manager = new MCPManager();
      await manager.connectServer(makeConfig());
      expect(mockConnect).toHaveBeenCalledTimes(1);

      await manager.connectServer(makeConfig());
      // 旧接続の close + 新接続の connect
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(mockConnect).toHaveBeenCalledTimes(2);
    });
  });

  describe('disconnectServer', () => {
    it('接続切断 + マップから削除される', async () => {
      const manager = new MCPManager();
      await manager.connectServer(makeConfig());
      expect(manager.getStatus('server-1')).toBe('connected');

      await manager.disconnectServer('server-1');
      expect(mockClose).toHaveBeenCalledOnce();
      expect(manager.getStatus('server-1')).toBe('disconnected');
    });

    it('存在しないIDで何もしない', async () => {
      const manager = new MCPManager();
      await expect(manager.disconnectServer('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('disconnectAll', () => {
    it('全接続を切断する', async () => {
      const manager = new MCPManager();
      await manager.connectServer(makeConfig({ id: 'a', name: 'A' }));
      await manager.connectServer(makeConfig({ id: 'b', name: 'B' }));

      await manager.disconnectAll();
      expect(manager.getStatus('a')).toBe('disconnected');
      expect(manager.getStatus('b')).toBe('disconnected');
    });
  });

  describe('getActiveServers', () => {
    it('connected のサーバーのみ返す', async () => {
      mockConnect
        .mockResolvedValueOnce(undefined) // a: 成功
        .mockRejectedValueOnce(new Error('失敗')); // b: 失敗

      const manager = new MCPManager();
      await manager.connectServer(makeConfig({ id: 'a', name: 'A' }));
      await manager.connectServer(makeConfig({ id: 'b', name: 'B' }));

      const active = manager.getActiveServers();
      expect(active).toHaveLength(1);
    });
  });

  describe('getStatus', () => {
    it('未登録IDで disconnected を返す', () => {
      const manager = new MCPManager();
      expect(manager.getStatus('unknown')).toBe('disconnected');
    });
  });

  describe('subscribe', () => {
    it('リスナー登録・解除が動作する', async () => {
      const manager = new MCPManager();
      const listener = vi.fn();

      const unsubscribe = manager.subscribe(listener);
      await manager.connectServer(makeConfig());
      // connecting + connected の 2 回通知
      expect(listener).toHaveBeenCalled();

      listener.mockClear();
      unsubscribe();
      await manager.disconnectServer('server-1');
      expect(listener).not.toHaveBeenCalled();
    });

    it('接続操作でリスナーに通知される', async () => {
      const manager = new MCPManager();
      const listener = vi.fn();
      manager.subscribe(listener);

      await manager.connectServer(makeConfig());
      // connectServer は connecting + connected の 2 回 notify する
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('syncWithConfig', () => {
    it('新規 enabled サーバーを接続する', async () => {
      const manager = new MCPManager();
      await manager.syncWithConfig([makeConfig()]);

      expect(manager.getStatus('server-1')).toBe('connected');
    });

    it('disabled / 消えたサーバーを切断する', async () => {
      const manager = new MCPManager();
      await manager.connectServer(makeConfig({ id: 'old' }));
      expect(manager.getStatus('old')).toBe('connected');

      // old は configs から消えた → 切断される
      await manager.syncWithConfig([makeConfig({ id: 'new' })]);
      expect(manager.getStatus('old')).toBe('disconnected');
      expect(manager.getStatus('new')).toBe('connected');
    });

    it('URL 変更で再接続する', async () => {
      const manager = new MCPManager();
      await manager.connectServer(makeConfig());
      expect(mockConnect).toHaveBeenCalledTimes(1);

      // URL が変わった → 再接続
      await manager.syncWithConfig([makeConfig({ url: 'http://localhost:4000/mcp' })]);
      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it('URL 同じで connected なら再接続しない', async () => {
      const manager = new MCPManager();
      await manager.connectServer(makeConfig());
      expect(mockConnect).toHaveBeenCalledTimes(1);

      // 同じ設定で再 sync → 再接続されない
      await manager.syncWithConfig([makeConfig()]);
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });
});
