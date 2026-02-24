import { getDB } from '../store/db';
import type { CalendarEvent } from '../types';

/** OpenAI function calling 形式のツールスキーマ */
export const WORKER_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'listCalendarEvents',
      description: 'カレンダーのイベント一覧を取得します。日付を指定すると、その日のイベントのみ返します。',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '日付（YYYY-MM-DD 形式）。省略すると全イベントを返します。',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getCurrentTime',
      description: '現在の日時を日本語形式で返します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

/** Worker 内でツールを実行する */
export async function executeWorkerTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'listCalendarEvents': {
      const db = await getDB();
      const date = args.date as string | undefined;
      let events: CalendarEvent[];
      if (date) {
        events = await db.getAllFromIndex('calendar', 'date', date);
      } else {
        events = (await db.getAll('calendar')) as CalendarEvent[];
      }
      if (events.length === 0) {
        return JSON.stringify({ events: [], message: 'イベントはありません。' });
      }
      return JSON.stringify({
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          time: e.time,
          description: e.description,
        })),
      });
    }
    case 'getCurrentTime': {
      return JSON.stringify({
        currentTime: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      });
    }
    default:
      return JSON.stringify({ error: `不明なツール: ${name}` });
  }
}
