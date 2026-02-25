import http from 'node:http';

const PORT = 4100;

/**
 * Heartbeat 用 OpenAI Chat Completions API モックサーバー。
 * SW 内の fetch がこのサーバーに向くことで、E2E テスト中に
 * 実際の OpenAI API を呼ばずに Heartbeat パイプラインを通せる。
 */

function createChatCompletionResponse(hasChanges: boolean) {
  const result = JSON.stringify({
    results: [
      {
        taskId: 'e2e-test-task',
        hasChanges,
        summary: hasChanges ? 'E2E テスト: 変化を検出しました' : '',
      },
    ],
  });

  return {
    id: `chatcmpl-test-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-5-nano',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: result,
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
  };
}

const server = http.createServer((req, res) => {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ヘルスチェック
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Chat Completions API モック
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      console.log(`[mock-openai] POST /v1/chat/completions (${body.length} bytes)`);
      const response = createChatCompletionResponse(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[mock-openai] OpenAI モックサーバー起動: http://localhost:${PORT}`);
});
