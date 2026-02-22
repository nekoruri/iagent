import { tool } from '@openai/agents';
import { z } from 'zod';
import { listEvents, createEvent } from '../store/calendarStore';

export const calendarTool = tool({
  name: 'calendar',
  description: `ローカルカレンダーを操作します。予定やリマインダーの一覧取得・作成ができます。
action:
- "list": 予定の一覧を取得。date にYYYY-MM-DD を指定するとその日のみ。不要なら空文字。
- "create": 予定を作成。title, date は必須。time, description は不要なら空文字。
- "create_reminder": リマインダーを作成。title, date は必須。`,
  parameters: z.object({
    action: z.enum(['list', 'create', 'create_reminder']),
    date: z.string().describe('YYYY-MM-DD形式の日付。不要な場合は空文字'),
    title: z.string().describe('予定のタイトル。不要な場合は空文字'),
    time: z.string().describe('HH:MM形式の時刻。不要な場合は空文字'),
    description: z.string().describe('予定の詳細。不要な場合は空文字'),
  }),
  execute: async ({ action, date, title, time, description }) => {
    if (action === 'list') {
      const events = await listEvents(date || undefined);
      if (events.length === 0) {
        return JSON.stringify({ message: date ? `${date} の予定はありません` : '予定はありません', events: [] });
      }
      return JSON.stringify({ events });
    }

    if (action === 'create' || action === 'create_reminder') {
      if (!title || !date) {
        return JSON.stringify({ error: 'title と date は必須です' });
      }
      const event = await createEvent({
        title,
        date,
        time: time || undefined,
        description: description || undefined,
        isReminder: action === 'create_reminder',
      });
      return JSON.stringify({ message: `${action === 'create_reminder' ? 'リマインダー' : '予定'}を作成しました`, event });
    }

    return JSON.stringify({ error: '不明なアクションです' });
  },
});
