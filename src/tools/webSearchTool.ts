import { tool } from '@openai/agents';
import { z } from 'zod';
import { getConfigValue } from '../core/config';

export const webSearchTool = tool({
  name: 'web_search',
  description: 'Web検索を行い、最新の情報を取得します。検索クエリを指定してください。上位5件の結果を返します。',
  parameters: z.object({
    query: z.string().describe('検索クエリ'),
  }),
  execute: async ({ query }) => {
    const apiKey = getConfigValue('braveApiKey');
    if (!apiKey) {
      return JSON.stringify({ error: 'Brave Search APIキーが設定されていません' });
    }

    try {
      const res = await fetch(
        `/api/brave/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
        {
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey,
          },
        },
      );

      if (!res.ok) {
        return JSON.stringify({ error: `Brave Search API エラー: ${res.status}` });
      }

      const data = await res.json();
      const results = (data.web?.results ?? []).map((r: { title: string; url: string; description: string }) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      }));

      return JSON.stringify({ query, results });
    } catch {
      return JSON.stringify({ error: 'Web検索に失敗しました' });
    }
  },
});
