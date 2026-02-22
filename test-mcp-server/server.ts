import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PORT = Number(process.env.PORT) || 3001;

// --- ツール登録ファクトリ ---
// McpServer は1つの transport にしか接続できないため、セッションごとに新規作成する

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'test-mcp-server',
    version: '1.0.0',
  });

  server.registerTool('echo', {
    title: 'Echo',
    description: 'メッセージをそのまま返すテストツール',
    inputSchema: { message: z.string().describe('返すメッセージ') },
  }, async ({ message }) => {
    console.log(`[tool] echo: ${JSON.stringify({ message })}`);
    return { content: [{ type: 'text', text: message }] };
  });

  server.registerTool('get_time', {
    title: 'Get Time',
    description: '現在の日時を返す',
    inputSchema: {},
  }, async () => {
    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    console.log(`[tool] get_time: ${now}`);
    return { content: [{ type: 'text', text: now }] };
  });

  server.registerTool('roll_dice', {
    title: 'Roll Dice',
    description: 'サイコロを振る',
    inputSchema: {
      sides: z.number().int().min(2).max(100).default(6).describe('面の数'),
      count: z.number().int().min(1).max(10).default(1).describe('振る回数'),
    },
  }, async ({ sides, count }) => {
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const text = JSON.stringify({ rolls, total: rolls.reduce((a, b) => a + b, 0) });
    console.log(`[tool] roll_dice: ${text}`);
    return { content: [{ type: 'text', text }] };
  });

  return server;
}

// --- セッション管理 ---

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

const sessions = new Map<string, Session>();

// --- HTTP サーバー ---

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, mcp-protocol-version');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use POST /mcp' }));
    return;
  }

  try {
    if (req.method === 'POST') {
      const body = await readBody(req);
      const parsedBody = JSON.parse(body);
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      let transport: StreamableHTTPServerTransport;

      if (sessionId && sessions.has(sessionId)) {
        // 既存セッション
        transport = sessions.get(sessionId)!.transport;
      } else if (!sessionId) {
        // 新規セッション（initialize リクエスト）
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { transport, server: mcpServer });
            console.log(`[session] created: ${id}`);
          },
        });

        transport.onclose = () => {
          const id = transport.sessionId;
          if (id) {
            sessions.delete(id);
            console.log(`[session] closed: ${id}`);
          }
        };

        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);
      } else {
        // 不明なセッションID
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Invalid session ID' },
          id: null,
        }));
        return;
      }

      await transport.handleRequest(req, res, parsedBody);

    } else if (req.method === 'GET') {
      // SSE ストリーム（サーバー → クライアント通知用）
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
        return;
      }
      const transport = sessions.get(sessionId)!.transport;
      await transport.handleRequest(req, res);

    } else if (req.method === 'DELETE') {
      // セッション終了
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.close();
        await session.server.close();
        sessions.delete(sessionId);
        console.log(`[session] terminated: ${sessionId}`);
      }
      res.writeHead(204);
      res.end();

    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    }

  } catch (err) {
    console.error('[error]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      }));
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`MCP Test Server running on http://localhost:${PORT}/mcp`);
  console.log('');
  console.log('登録ツール:');
  console.log('  echo       - メッセージをそのまま返す');
  console.log('  get_time   - 現在の日時を返す');
  console.log('  roll_dice  - サイコロを振る');
  console.log('');
  console.log('iAgent の設定で以下のURLを入力してください:');
  console.log(`  http://localhost:${PORT}/mcp`);
});
