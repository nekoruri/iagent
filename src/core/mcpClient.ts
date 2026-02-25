import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { MCPServer } from '@openai/agents';
import { validateUrl } from './urlValidation';

/** MCPServer.listTools() が返すツール定義 */
type MCPTool = Awaited<ReturnType<MCPServer['listTools']>>[number];
/** MCPServer.callTool() が返す結果 */
type CallToolResultContent = Awaited<ReturnType<MCPServer['callTool']>>;

/**
 * ブラウザ環境で動作するMCPServerの実装。
 * @openai/agents-core のブラウザ shim が未実装のため、
 * Node.js 版の NodeMCPServerStreamableHttp を参考にカスタム実装。
 */
export class BrowserMCPServer implements MCPServer {
  cacheToolsList = true;

  private _name: string;
  private _url: string;
  private _client: Client | null = null;
  private _transport: StreamableHTTPClientTransport | null = null;
  private _cacheDirty = true;
  private _toolsList: MCPTool[] = [];

  constructor(options: { name: string; url: string }) {
    this._name = options.name;
    this._url = validateUrl(options.url);
  }

  get name(): string {
    return this._name;
  }

  async connect(): Promise<void> {
    try {
      this._transport = new StreamableHTTPClientTransport(new URL(this._url));
      this._client = new Client({
        name: this._name,
        version: '1.0.0',
      });
      await this._client.connect(this._transport);
    } catch (e) {
      await this.close();
      throw e;
    }
  }

  async close(): Promise<void> {
    const transport = this._transport;
    if (transport) {
      if (transport.sessionId && typeof transport.terminateSession === 'function') {
        try {
          await transport.terminateSession();
        } catch {
          // best-effort cleanup
        }
      }
      await transport.close();
      this._transport = null;
    }
    if (this._client) {
      await this._client.close();
      this._client = null;
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this._client) {
      throw new Error('Server not initialized. Make sure you call connect() first.');
    }
    if (this.cacheToolsList && !this._cacheDirty && this._toolsList.length > 0) {
      return this._toolsList;
    }
    this._cacheDirty = false;
    const response = await this._client.listTools();
    this._toolsList = ListToolsResultSchema.parse(response).tools as MCPTool[];
    return this._toolsList;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> | null,
    meta?: Record<string, unknown> | null,
  ): Promise<CallToolResultContent> {
    if (!this._client) {
      throw new Error('Server not initialized. Make sure you call connect() first.');
    }
    const params = {
      name: toolName,
      arguments: args ?? {},
      ...(meta != null ? { _meta: meta } : {}),
    };
    const response = await this._client.callTool(params);
    const parsed = CallToolResultSchema.parse(response);
    return parsed.content as CallToolResultContent;
  }

  async invalidateToolsCache(): Promise<void> {
    this._cacheDirty = true;
  }
}
