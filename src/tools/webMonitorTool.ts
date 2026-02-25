import { tool } from '@openai/agents';
import { z } from 'zod';
import { saveMonitor, listMonitors, deleteMonitor, getMonitor, updateMonitor, computeHash } from '../store/monitorStore';
import { fetchViaProxy } from '../core/corsProxy';

const MAX_TEXT_LENGTH = 10 * 1024; // 10KB

export const webMonitorTool = tool({
  name: 'web_monitor',
  description: `Webページの変更を監視します。ページの特定部分（CSSセレクタ指定可）を定期的にチェックし、変化を検出します。
action:
- "watch": 監視対象を追加。url, name は必須。selector は CSS セレクタ（省略時は body 全体）。
- "unwatch": 監視を解除。monitor_id を指定。
- "list": 監視中のページ一覧を取得。
- "check": 特定の監視対象を即座にチェック。monitor_id を指定。
- "check_all": 全監視対象を一括チェック。`,
  parameters: z.object({
    action: z.enum(['watch', 'unwatch', 'list', 'check', 'check_all']),
    url: z.string().describe('監視するURL。watch 時に必須、他は空文字'),
    name: z.string().describe('監視対象の名前。watch 時に必須、他は空文字'),
    selector: z.string().describe('CSS セレクタ。watch 時に任意（空=body全体）、他は空文字'),
    monitor_id: z.string().describe('監視ID。unwatch/check 時に必須、他は空文字'),
  }),
  execute: async ({ action, url, name, selector, monitor_id }) => {
    if (action === 'watch') {
      if (!url || !name) return JSON.stringify({ error: 'url と name は必須です' });
      try {
        const { text, hash } = await fetchAndExtract(url, selector || undefined);
        const monitor = await saveMonitor({
          url,
          name,
          selector: selector || undefined,
          lastHash: hash,
          lastText: text,
        });
        return JSON.stringify({
          message: '監視を開始しました',
          monitor: { id: monitor.id, name: monitor.name, url: monitor.url, selector: monitor.selector },
        });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : '監視の開始に失敗しました' });
      }
    }

    if (action === 'unwatch') {
      if (!monitor_id) return JSON.stringify({ error: 'monitor_id は必須です' });
      const deleted = await deleteMonitor(monitor_id);
      return JSON.stringify({ message: deleted ? '監視を解除しました' : '監視対象が見つかりません' });
    }

    if (action === 'list') {
      const monitors = await listMonitors();
      return JSON.stringify({
        monitors: monitors.map((m) => ({
          id: m.id, name: m.name, url: m.url, selector: m.selector,
          lastCheckedAt: m.lastCheckedAt, changeDetectedAt: m.changeDetectedAt,
        })),
        count: monitors.length,
      });
    }

    if (action === 'check') {
      if (!monitor_id) return JSON.stringify({ error: 'monitor_id は必須です' });
      try {
        const result = await checkMonitor(monitor_id);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : 'チェックに失敗しました' });
      }
    }

    if (action === 'check_all') {
      const monitors = await listMonitors();
      const results = [];
      for (const monitor of monitors) {
        try {
          const result = await checkMonitor(monitor.id);
          results.push(result);
        } catch (e) {
          results.push({
            monitorId: monitor.id,
            name: monitor.name,
            hasChanged: false,
            error: e instanceof Error ? e.message : 'チェック失敗',
          });
        }
      }
      return JSON.stringify({ results, totalMonitors: monitors.length });
    }

    return JSON.stringify({ error: '不明なアクションです' });
  },
});

/** URL からテキストを取得して抽出・ハッシュ計算 */
async function fetchAndExtract(url: string, selector?: string): Promise<{ text: string; hash: string }> {
  const response = await fetchViaProxy(url);
  const html = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let text: string;
  if (selector) {
    const el = doc.querySelector(selector);
    if (!el) throw new Error(`セレクタ "${selector}" に一致する要素が見つかりません`);
    text = el.textContent?.trim() ?? '';
  } else {
    text = doc.body?.textContent?.trim() ?? '';
  }

  text = text.slice(0, MAX_TEXT_LENGTH);
  const hash = await computeHash(text);
  return { text, hash };
}

/** 単一の監視対象をチェックして変更検出 */
async function checkMonitor(monitorId: string): Promise<{
  monitorId: string;
  name: string;
  hasChanged: boolean;
  summary?: string;
}> {
  const monitor = await getMonitor(monitorId);
  if (!monitor) throw new Error('監視対象が見つかりません');

  const { text, hash } = await fetchAndExtract(monitor.url, monitor.selector);
  const hasChanged = hash !== monitor.lastHash;
  const now = Date.now();

  await updateMonitor(monitorId, {
    lastHash: hash,
    lastText: text,
    lastCheckedAt: now,
    ...(hasChanged ? { changeDetectedAt: now } : {}),
  });

  return {
    monitorId: monitor.id,
    name: monitor.name,
    hasChanged,
    summary: hasChanged
      ? `「${monitor.name}」(${monitor.url}) のコンテンツが変化しました。`
      : undefined,
  };
}
