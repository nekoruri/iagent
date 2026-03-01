import type { AppConfig, ConfigKey, HeartbeatConfig, HeartbeatTask, OtelConfig, PersonaConfig, ProxyConfig, ThemeMode } from '../types';
import { saveConfigToIDB } from '../store/configStore';

const STORAGE_KEY = 'iagent-config';

export const BUILTIN_HEARTBEAT_TASKS: HeartbeatTask[] = [
  {
    id: 'calendar-check',
    name: 'カレンダーチェック',
    description: '1時間以内に予定があれば通知します。',
    enabled: true,
    type: 'builtin',
  },
  {
    id: 'weather-check',
    name: '天気チェック',
    description: '現在地の天気を確認し、急な天候変化があれば通知します。',
    enabled: false,
    type: 'builtin',
  },
  {
    id: 'feed-check',
    name: 'フィードチェック',
    description: '購読中の RSS フィードの新着記事を取得し、3段階に分類します。'
      + '手順: fetchFeeds → listUnreadFeedItems → 3段階分類（must-read/recommended/skip） → saveFeedClassification。'
      + '分類基準: ユーザーの目標・嗜好を踏まえて、必読/おすすめ/スキップに分類してください。'
      + '30件ずつ処理し、全件分類するまで繰り返してください。',
    enabled: false,
    type: 'builtin',
  },
  {
    id: 'web-monitor-check',
    name: 'Webページ監視',
    description: '監視中のWebページに変化がないかチェックし、変化があれば通知します。',
    enabled: false,
    type: 'builtin',
  },
  {
    id: 'reflection',
    name: 'ふりかえり',
    description: '1日の記憶を振り返り、パターンや洞察を抽出して長期記憶に保存します。',
    enabled: false,
    type: 'builtin',
    schedule: { type: 'fixed-time', hour: 23, minute: 0 },
  },
  {
    id: 'briefing-morning',
    name: '朝のブリーフィング',
    description: '朝に本日の予定・ニュース・Web 変化・記憶をまとめたブリーフィングを生成します。'
      + 'ユーザーの目標（goal）と現在の状況（context）を踏まえて、今日注意すべき点やアクションを提案してください。'
      + 'ツールを使って情報を収集し、優先度をつけて簡潔なサマリーを作成してください。'
      + 'listClassifiedFeedItems を使って分類済みの必読記事・おすすめ記事をブリーフィングに含めてください。'
      + '必ず hasChanges: true を返し、summary にブリーフィングテキストを含めてください。',
    enabled: false,
    type: 'builtin',
    schedule: { type: 'fixed-time', hour: 7, minute: 0 },
  },
];

export function getDefaultProxyConfig(): ProxyConfig {
  return {
    enabled: false,
    serverUrl: '',
    authToken: '',
    allowedDomains: [],
  };
}

export function getDefaultOtelConfig(): OtelConfig {
  return {
    enabled: false,
    endpoint: '/api/otel',
    headers: {},
    batchSize: 10,
    flushIntervalMs: 30000,
  };
}

export function getDefaultPersonaConfig(): PersonaConfig {
  return {
    name: 'iAgent',
    personality: '',
    tone: '',
    customInstructions: '',
  };
}

export function getDefaultHeartbeatConfig(): HeartbeatConfig {
  return {
    enabled: false,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    tasks: BUILTIN_HEARTBEAT_TASKS.map((t) => ({ ...t })),
    desktopNotification: false,
  };
}

/** 保存済み tasks に不足しているビルトインタスクを追加する */
function mergeBuiltinTasks(savedTasks: HeartbeatTask[]): HeartbeatTask[] {
  const existingIds = new Set(savedTasks.map((t) => t.id));
  const missing = BUILTIN_HEARTBEAT_TASKS
    .filter((b) => !existingIds.has(b.id))
    .map((t) => ({ ...t }));
  return [...savedTasks, ...missing];
}

export function getConfig(): AppConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { openaiApiKey: '', braveApiKey: '', openWeatherMapApiKey: '', mcpServers: [], heartbeat: getDefaultHeartbeatConfig(), push: { enabled: false, serverUrl: '' }, proxy: getDefaultProxyConfig(), otel: getDefaultOtelConfig(), persona: getDefaultPersonaConfig(), theme: 'system' };
  }
  const parsed = JSON.parse(raw) as Partial<AppConfig>;
  const heartbeat = parsed.heartbeat
    ? { ...getDefaultHeartbeatConfig(), ...parsed.heartbeat }
    : getDefaultHeartbeatConfig();
  // 不足しているビルトインタスクを補完
  heartbeat.tasks = mergeBuiltinTasks(heartbeat.tasks);
  return {
    openaiApiKey: parsed.openaiApiKey ?? '',
    braveApiKey: parsed.braveApiKey ?? '',
    openWeatherMapApiKey: parsed.openWeatherMapApiKey ?? '',
    mcpServers: parsed.mcpServers ?? [],
    heartbeat,
    push: parsed.push ?? { enabled: false, serverUrl: '' },
    proxy: parsed.proxy
      ? { ...getDefaultProxyConfig(), ...parsed.proxy }
      : getDefaultProxyConfig(),
    otel: parsed.otel
      ? { ...getDefaultOtelConfig(), ...parsed.otel }
      : getDefaultOtelConfig(),
    persona: parsed.persona
      ? { ...getDefaultPersonaConfig(), ...parsed.persona }
      : getDefaultPersonaConfig(),
    theme: (['light', 'dark', 'system'].includes(parsed.theme as string)
      ? parsed.theme as ThemeMode
      : 'system'),
  };
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  // Worker 向け: IndexedDB にも非同期書き込み
  saveConfigToIDB(config).catch((e) => console.warn('[iAgent] IndexedDB 設定保存失敗:', e));
}

export function getConfigValue(key: ConfigKey): string {
  return getConfig()[key];
}

export function isConfigured(): boolean {
  const config = getConfig();
  return config.openaiApiKey.length > 0;
}
