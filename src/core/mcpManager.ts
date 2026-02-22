import type { MCPServer } from '@openai/agents';
import { BrowserMCPServer } from './mcpClient';
import type { MCPServerConfig } from '../types';

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ManagedServer {
  config: MCPServerConfig;
  server: BrowserMCPServer;
  status: MCPConnectionStatus;
  error?: string;
}

class MCPManager {
  private servers = new Map<string, ManagedServer>();
  private listeners = new Set<() => void>();

  /** 状態変更リスナー登録 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  async connectServer(config: MCPServerConfig): Promise<void> {
    // 既存接続があれば先に切断
    if (this.servers.has(config.id)) {
      await this.disconnectServer(config.id);
    }

    const server = new BrowserMCPServer({
      name: config.name,
      url: config.url,
    });

    const managed: ManagedServer = {
      config,
      server,
      status: 'connecting',
    };
    this.servers.set(config.id, managed);
    this.notify();

    try {
      await server.connect();
      managed.status = 'connected';
    } catch (e) {
      managed.status = 'error';
      managed.error = e instanceof Error ? e.message : String(e);
    }
    this.notify();
  }

  async disconnectServer(id: string): Promise<void> {
    const managed = this.servers.get(id);
    if (!managed) return;

    try {
      await managed.server.close();
    } catch {
      // best-effort cleanup
    }
    this.servers.delete(id);
    this.notify();
  }

  async disconnectAll(): Promise<void> {
    const ids = [...this.servers.keys()];
    await Promise.all(ids.map((id) => this.disconnectServer(id)));
  }

  /** Agent に渡す用の MCPServer 配列 */
  getActiveServers(): MCPServer[] {
    const result: MCPServer[] = [];
    for (const managed of this.servers.values()) {
      if (managed.status === 'connected') {
        result.push(managed.server);
      }
    }
    return result;
  }

  getStatus(id: string): MCPConnectionStatus {
    return this.servers.get(id)?.status ?? 'disconnected';
  }

  getError(id: string): string | undefined {
    return this.servers.get(id)?.error;
  }

  /** 設定変更時に差分で接続/切断 */
  async syncWithConfig(configs: MCPServerConfig[]): Promise<void> {
    const desiredIds = new Set(configs.filter((c) => c.enabled).map((c) => c.id));
    const currentIds = new Set(this.servers.keys());

    // 不要な接続を切断
    for (const id of currentIds) {
      if (!desiredIds.has(id)) {
        await this.disconnectServer(id);
      }
    }

    // 新規・変更された接続を開始
    for (const config of configs) {
      if (!config.enabled) continue;
      const existing = this.servers.get(config.id);
      if (existing && existing.config.url === config.url && existing.status === 'connected') {
        // URL が変わっていなければ再接続不要
        continue;
      }
      await this.connectServer(config);
    }
  }
}

export const mcpManager = new MCPManager();
