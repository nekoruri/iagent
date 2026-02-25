import type { Page } from '@playwright/test';

/**
 * OpenAI Responses API の SSE ストリーミングレスポンスをモックする。
 * @openai/agents SDK の SSEDecoder が期待するフォーマットに準拠。
 */
export function createSSEResponse(text: string): string {
  const responseId = `resp_test_${Date.now()}`;
  const itemId = `item_test_${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);

  const events = [
    {
      event: 'response.created',
      data: {
        type: 'response.created',
        response: {
          id: responseId,
          created_at: now,
          output_text: '',
          output: [],
          object: 'response',
          status: 'in_progress',
          usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 },
          model: 'gpt-5-mini',
          error: null,
          incomplete_details: null,
          instructions: null,
          metadata: null,
        },
        sequence_number: 1,
      },
    },
    {
      event: 'response.output_item.added',
      data: {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'message',
          id: itemId,
          role: 'assistant',
          content: [],
          status: 'in_progress',
        },
        sequence_number: 2,
      },
    },
    {
      event: 'response.content_part.added',
      data: {
        type: 'response.content_part.added',
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '' },
        sequence_number: 3,
      },
    },
    {
      event: 'response.output_text.delta',
      data: {
        type: 'response.output_text.delta',
        delta: text,
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        sequence_number: 4,
      },
    },
    {
      event: 'response.output_text.done',
      data: {
        type: 'response.output_text.done',
        text,
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        sequence_number: 5,
      },
    },
    {
      event: 'response.content_part.done',
      data: {
        type: 'response.content_part.done',
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text },
        sequence_number: 6,
      },
    },
    {
      event: 'response.output_item.done',
      data: {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'message',
          id: itemId,
          role: 'assistant',
          content: [{ type: 'output_text', text }],
          status: 'completed',
        },
        sequence_number: 7,
      },
    },
    {
      event: 'response.completed',
      data: {
        type: 'response.completed',
        response: {
          id: responseId,
          created_at: now,
          output_text: text,
          output: [
            {
              type: 'message',
              id: itemId,
              role: 'assistant',
              content: [{ type: 'output_text', text }],
              status: 'completed',
            },
          ],
          object: 'response',
          status: 'completed',
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          model: 'gpt-5-mini',
          error: null,
          incomplete_details: null,
          instructions: null,
          metadata: null,
        },
        sequence_number: 8,
      },
    },
  ];

  // 各イベントは "event: ...\ndata: ...\n\n" 形式。最後に空行を追加して SSE パーサーが全イベントを flush するようにする
  return events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n`)
    .join('\n') + '\n';
}

/**
 * OpenAI Responses API をモックしてテスト用の SSE レスポンスを返す。
 */
export async function mockOpenAIResponses(
  page: Page,
  responseText = 'これはテスト応答です。',
): Promise<void> {
  await page.route('**/api.openai.com/v1/responses**', async (route) => {
    const body = createSSEResponse(responseText);
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body,
    });
  });
}

/**
 * Brave Search API をモックする。
 */
export async function mockBraveSearch(page: Page): Promise<void> {
  await page.route('**/api.search.brave.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        web: { results: [{ title: 'テスト結果', url: 'https://example.com', description: 'テスト説明' }] },
      }),
    });
  });
}

/**
 * OpenWeatherMap API をモックする。
 */
export async function mockWeatherAPI(page: Page): Promise<void> {
  await page.route('**/api.openweathermap.org/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        main: { temp: 20, humidity: 50 },
        weather: [{ description: '晴れ' }],
        name: 'Tokyo',
      }),
    });
  });
}
