export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  source?: 'chat' | 'heartbeat';
  conversationId?: string;
  attachmentIds?: string[];
  explanationTitle?: string;
  explanationWhyNow?: string;
  explanationOutcome?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  args?: string;
  result?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type SuggestionFrequency = 'high' | 'medium' | 'low';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  description?: string;
  isReminder?: boolean;
  createdAt: number;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface TaskSchedule {
  type: 'global' | 'interval' | 'fixed-time';
  intervalMinutes?: number;       // type='interval' 時
  hour?: number;                  // type='fixed-time' 時 (0-23)
  minute?: number;                // type='fixed-time' 時 (0-59)
}

export interface TaskRunCondition {
  type: 'time-window';
  startHour: number;              // 0-23, 含む
  endHour: number;                // 0-23, 含まない（start=end は終日）
}

export interface HeartbeatTask {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: 'builtin' | 'custom';
  schedule?: TaskSchedule;        // 未設定 or type='global' はグローバル間隔に従う
  condition?: TaskRunCondition;   // 実行条件（未設定なら常時）
  allowedMcpTools?: string[];     // Heartbeat 実行時に許可する MCP ツール名リスト
}

/** Heartbeat 実行元を示すソース識別子 */
export type HeartbeatSource = 'tab' | 'worker' | 'push' | 'periodic-sync';

export type FeedbackType = 'accepted' | 'dismissed' | 'snoozed';

export interface HeartbeatFeedback {
  type: FeedbackType;
  snoozedUntil?: number;  // snoozed の場合のみ
  timestamp: number;
}

export interface HeartbeatResult {
  taskId: string;
  timestamp: number;
  hasChanges: boolean;
  summary: string;
  source?: HeartbeatSource;
  pinned?: boolean;
  feedback?: HeartbeatFeedback;
  flowId?: string;
  contextSnapshotId?: string;
  notificationReason?: string;
}

export type DeviceTimeOfDay = 'morning' | 'daytime' | 'evening' | 'late-night';
export type DeviceCalendarState = 'empty' | 'upcoming-soon' | 'in-meeting-window' | 'busy-today';
export type DeviceOnlineState = 'online' | 'offline' | 'unknown';
export type DeviceFocusState = 'focused' | 'normal' | 'quiet-hours';
export type DeviceMode = 'desktop-browser' | 'desktop-pwa' | 'mobile-browser' | 'mobile-pwa' | 'unknown';
export type InstallState = 'installed' | 'browser' | 'unknown';
export type DeviceScene =
  | 'morning-briefing'
  | 'pre-meeting'
  | 'focused-work'
  | 'evening-review'
  | 'offline-recovery'
  | 'late-night'
  | 'general';

export interface DeviceContextSnapshotV1 {
  capturedAt: number;
  timeOfDay: DeviceTimeOfDay;
  calendarState: DeviceCalendarState;
  onlineState: DeviceOnlineState;
  focusState: DeviceFocusState;
  deviceMode: DeviceMode;
  installState: InstallState;
  scene: DeviceScene;
}

export type AutonomyEventStage = 'trigger' | 'context' | 'decision' | 'delivery' | 'reaction';
export type InterventionLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export interface HeartbeatState {
  lastChecked: number;
  recentResults: HeartbeatResult[];
  taskLastRun?: Record<string, number>;  // taskId → timestamp
}

export interface HeartbeatConfig {
  enabled: boolean;
  intervalMinutes: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  quietDays: number[];               // 0=日曜...6=土曜。この曜日は全タスクスキップ
  maxNotificationsPerDay: number;    // 日次通知上限（0=無制限）
  tasks: HeartbeatTask[];
  desktopNotification: boolean;
  focusMode: boolean;
  costControl?: HeartbeatCostControlConfig;
}

export type HeartbeatModelGrade = 'low' | 'standard';

export interface HeartbeatCostControlConfig {
  enabled: boolean;
  dailyTokenBudget: number;      // 0=無制限
  pressureThreshold: number;     // 0.0-1.0（例: 0.8 = 80%）
  deferNonCriticalTasks: boolean;
}

export interface PushConfig {
  enabled: boolean;
  serverUrl: string;
}

export interface ProxyConfig {
  enabled: boolean;
  serverUrl: string;       // プロキシサーバー URL
  authToken: string;       // Bearer トークン（/register で自動取得）
  allowedDomains: string[];  // 許可ドメインリスト（クライアント側制御、空=全許可）
}

export interface OtelConfig {
  enabled: boolean;
  endpoint: string;
  headers: Record<string, string>;
  batchSize: number;
  flushIntervalMs: number;
}

export interface WebSpeechConfig {
  sttEnabled: boolean;       // 音声入力有効
  ttsEnabled: boolean;       // 音声出力有効
  ttsAutoRead: boolean;      // AI 応答の自動読み上げ
  lang: string;              // 'ja-JP'
  ttsRate: number;           // 0.5-2.0
}

export interface AppConfig {
  openaiApiKey: string;
  braveApiKey: string;
  openWeatherMapApiKey: string;
  mcpServers: MCPServerConfig[];
  heartbeat?: HeartbeatConfig;
  push?: PushConfig;
  proxy?: ProxyConfig;
  otel?: OtelConfig;
  persona?: PersonaConfig;
  theme?: ThemeMode;
  suggestionFrequency?: SuggestionFrequency;
  webSpeech?: WebSpeechConfig;
}

export type MemoryCategory = 'preference' | 'fact' | 'context' | 'routine' | 'goal' | 'personality' | 'reflection' | 'other';

export interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;   // 1-5, デフォルト 3
  tags: string[];       // 自由形式タグ
  createdAt: number;
  updatedAt: number;
  accessCount: number;      // 参照回数（初期値 0）
  lastAccessedAt: number;   // 最終アクセス日時（初期値 = createdAt）
  contentHash: string;       // SHA-256 ハッシュ（重複検出用）
}

export interface ArchivedMemory extends Memory {
  archivedAt: number;
  archiveReason: 'low-score' | 'manual' | 'consolidation';
}

export interface PersonaConfig {
  name: string;              // エージェント名 (デフォルト: 'iAgent')
  personality: string;       // 性格・特徴の自由記述
  tone: string;              // 話し方
  customInstructions: string; // ユーザー独自の追加指示
}

/** getConfigValue() で文字列として取得可能なキー */
export type ConfigKey = 'openaiApiKey' | 'braveApiKey' | 'openWeatherMapApiKey';

// Phase C: 外部情報収集ツール型定義
export type { Clip } from './clip';
export type { Feed, FeedItem, FeedItemTier, FeedItemDisplayTier } from './feed';
export type { Monitor } from './monitor';
