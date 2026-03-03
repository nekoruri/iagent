import type { AppConfig, ConfigKey, HeartbeatConfig, HeartbeatTask, OtelConfig, PersonaConfig, ProxyConfig, SuggestionFrequency, ThemeMode } from '../types';
import { saveConfigToIDB } from '../store/configStore';

const STORAGE_KEY = 'iagent-config';

export const BUILTIN_HEARTBEAT_TASKS: HeartbeatTask[] = [
  {
    id: 'calendar-check',
    name: 'カレンダーチェック',
    description: '1時間以内に予定があれば関連情報を付加して通知します。'
      + '手順: 1) listCalendarEvents で今日の予定を取得 → 2) 1時間以内の予定を特定 → 3) searchMemoriesByQuery でイベントタイトルや関係者名をキーワードに記憶を検索 → 4) 関連情報（前回の議事メモ、予算情報、コンテキスト等）を付加した通知を生成。'
      + '関連メモリが見つかった場合は、予定の概要に加えて関連情報も summary に含めてください。',
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
      + '手順: 1) fetchFeeds で新着取得（失敗してもOK） → 2) listUnreadFeedItems で未分類記事一覧を取得 → 3) 各記事を must-read/recommended/skip に分類 → 4) saveFeedClassification で保存。'
      + 'fetchFeeds がエラーでも、既存の未分類記事があれば分類を続行してください。'
      + '分類基準: ユーザーの目標・嗜好を踏まえて、必読/おすすめ/スキップに分類してください。'
      + '30件ずつ処理し、hasMore が true なら繰り返してください。',
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
    description: '1日の記憶を振り返り、パターンや洞察を抽出して長期記憶に保存します。'
      + '手順: 1) getRecentMemoriesForReflection で直近24時間の記憶とアクセス上位を取得 → 2) getHeartbeatFeedbackSummary で直近24時間のフィードバック統計を取得 → 3) 記憶のパターンを分析（行動連鎖、情報の成熟度、トピック集約） → 4) フィードバック分析（Accept率の高い/低いタスクの特徴、改善点の抽出） → 5) saveReflection で洞察を保存（タグ例: feedback-analysis, filter-tuning, user-pattern, daily-summary） → 6) cleanupMemories で低スコア記憶をアーカイブ。'
      + 'フィードバック分析では、Accept率が低いタスクの原因（タイミング、内容の関連性、情報量）を考察し、改善提案を洞察として保存してください。',
    enabled: false,
    type: 'builtin',
    schedule: { type: 'fixed-time', hour: 23, minute: 0 },
  },
  {
    id: 'info-cleanup-check',
    name: '情報整理チェック',
    description: '未分類フィード・未読記事・クリップの件数が閾値を超えていないかチェックし、超過していれば整理を提案します。'
      + '手順: 1) getInfoThresholdStatus で各カウントと閾値を取得 → 2) exceeded が false なら hasChanges: false で終了 → 3) exceeded が true の場合、超過項目ごとに具体的な整理アクションを提案（例: 未分類フィードが多い→分類を実行、クリップが多い→古いクリップの整理を提案）。',
    enabled: false,
    type: 'builtin',
    schedule: { type: 'fixed-time', hour: 20, minute: 0 },
  },
  {
    id: 'weekly-summary',
    name: '週次サマリー',
    description: '月曜日に1週間のふりかえりを集約し、週次レビューを生成します。'
      + '手順: 1) getCurrentTime で現在の曜日を確認 → 月曜日でなければ hasChanges: false で終了 → 2) getWeeklyReflections(periodDays=7) で今週のふりかえりを取得 → 3) getHeartbeatFeedbackSummary(periodHours=168) で7日分のフィードバック統計を取得 → 4) 分析: 共通テーマ抽出、Accept率の変化傾向、改善・悪化したタスク、来週の改善ポイントを整理 → 5) saveReflection で週次レビューを保存（tags: weekly-review、importance: 4） → 6) ふりかえりもフィードバックも0件の場合のみ hasChanges: false。',
    enabled: false,
    type: 'builtin',
    schedule: { type: 'fixed-time', hour: 21, minute: 0 },
  },
  {
    id: 'monthly-review',
    name: '月次レビュー',
    description: '月初（1日）に過去1ヶ月の goal の活動状態・期限を集計し、月次レビューを生成します。'
      + '手順: 1) getCurrentTime で現在の日付を確認 → 1日でなければ hasChanges: false で終了 → 2) getMonthlyGoalStats で goal 全体の統計を取得 → 3) getWeeklyReflections(periodDays=30) で過去30日のふりかえりを取得 → 4) getHeartbeatFeedbackSummary(periodHours=720) で30日分のフィードバック統計を取得 → 5) 分析: 各 goal の活動状態を「活動中」「新規」「停滞」「期限超過」に分類し、月間の傾向（目標の進捗、新たに追加された目標、放置されている目標）を整理 → 6) 改善提案: 停滞 goal には小さな一歩を提案、期限超過 goal には見直し（継続・修正・削除）を提案、活動中 goal には次月の注力ポイントを提案 → 7) saveReflection で月次レビューを保存（tags: monthly-review、importance: 4） → 8) goal もふりかえりもフィードバックも0件の場合のみ hasChanges: false。',
    enabled: false,
    type: 'builtin',
    schedule: { type: 'fixed-time', hour: 8, minute: 0 },
  },
  {
    id: 'pattern-recognition',
    name: 'パターン認識',
    description: 'ユーザーの行動パターンを分析し、洞察を長期記憶に保存します。'
      + '手順: 1) getUserActivityPatterns(periodDays=14) で直近2週間の行動パターンを取得 '
      + '→ 2) totalResults < 5 または totalWithFeedback < 3 なら hasChanges: false で終了 '
      + '→ 3) 分析結果を以下の観点で解釈: '
      + '(a) 通知の最適タイミング（bestHours/bestDays の Accept 率が高い時間帯・曜日）、'
      + '(b) タスク品質トレンド（improving/declining のタスクとその要因推察）、'
      + '(c) 関心の変化（rising/falling のトピックタグ）、'
      + '(d) 改善提案（declining タスクへの具体的な改善案）'
      + '→ 4) saveReflection で洞察を保存（tags: user-pattern,activity-analysis、importance: 4）。'
      + '洞察は箇条書きで構造化してください。',
    enabled: false,
    type: 'builtin',
    schedule: { type: 'fixed-time', hour: 22, minute: 0 },
  },
  {
    id: 'suggestion-optimization',
    name: '提案品質の最適化',
    description: 'フィードバック統計と行動パターンを分析し、提案品質の最適化ルールを生成・保存し、設定変更を自動実行します。'
      + '手順: 1) getSuggestionOptimizations(periodDays=14) で最適化分析を取得 '
      + '→ 2) totalWithFeedback < 5 なら hasChanges: false で終了 '
      + '→ 3) 分析結果を以下の観点で解釈: '
      + '(a) タスク別調整（maintain/improve/reduce-frequency/disable-candidate の理由と具体策）、'
      + '(b) タイミング最適化（suggestedQuietHours/Days の活用提案）、'
      + '(c) カテゴリ重み調整（rising/falling タグの傾向）、'
      + '(d) 総合スコアに基づく改善方針 '
      + '→ 4) saveReflection で最適化ルールを保存（tags: suggestion-optimization,auto-tune、importance: 4）。'
      + 'ルールは「〜すべき」「〜を優先する」等の指示形式で記述し、次回以降の提案生成時に参照されるようにしてください。'
      + '→ 5) applyHeartbeatConfigAction で分析結果に基づく設定変更を自動実行: '
      + '(a) disable-candidate タスク → toggle-task で enabled: false に変更、'
      + '(b) reduce-frequency タスク → update-task-interval で間隔を現在の1.5倍に増加（最大120分、fixed-time は除外）、'
      + '(c) suggestedQuietHours → update-quiet-hours で quietHoursStart/End を更新、'
      + '(d) suggestedQuietDays → update-quiet-days で quietDays を更新。'
      + '各アクションの reason に分析根拠を記述してください。アクションが不要な場合はステップ5をスキップしても構いません。',
    enabled: false,
    type: 'builtin',
    schedule: { type: 'fixed-time', hour: 23, minute: 30 },
  },
  {
    id: 'briefing-morning',
    name: '朝のブリーフィング',
    description: '朝に本日の予定・ニュース・Web 変化・記憶をまとめたブリーフィングを生成します。'
      + 'ユーザーの目標（goal）と現在の状況（context）を踏まえて、今日注意すべき点やアクションを提案してください。'
      + 'ツールを使って情報を収集し、優先度をつけて簡潔なサマリーを作成してください。'
      + 'listClassifiedFeedItems を使って分類済みの必読記事・おすすめ記事をブリーフィングに含めてください。'
      + 'getCrossSourceTopics を使ってソース横断トピックを検出し、2ソース以上で言及されているトピックは「N ソースで言及」と表示してください。統合済みトピックは個別記事より優先して表示してください。'
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
    quietDays: [],
    maxNotificationsPerDay: 0,
    tasks: BUILTIN_HEARTBEAT_TASKS.map((t) => ({ ...t })),
    desktopNotification: false,
    focusMode: false,
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
    suggestionFrequency: (['high', 'medium', 'low'].includes(parsed.suggestionFrequency as string)
      ? parsed.suggestionFrequency as SuggestionFrequency
      : undefined),
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
