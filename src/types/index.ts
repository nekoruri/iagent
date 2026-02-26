export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  source?: 'chat' | 'heartbeat';
  conversationId?: string;
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

export interface HeartbeatTask {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: 'builtin' | 'custom';
  schedule?: TaskSchedule;        // 未設定 or type='global' はグローバル間隔に従う
  allowedMcpTools?: string[];     // Heartbeat 実行時に許可する MCP ツール名リスト
}

/** Heartbeat 実行元を示すソース識別子 */
export type HeartbeatSource = 'tab' | 'worker' | 'push' | 'periodic-sync';

export interface HeartbeatResult {
  taskId: string;
  timestamp: number;
  hasChanges: boolean;
  summary: string;
  source?: HeartbeatSource;
}

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
  tasks: HeartbeatTask[];
  desktopNotification: boolean;
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
}

export type MemoryCategory = 'preference' | 'fact' | 'context' | 'routine' | 'goal' | 'personality' | 'other';

export interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;   // 1-5, デフォルト 3
  tags: string[];       // 自由形式タグ
  createdAt: number;
  updatedAt: number;
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
export type { Feed, FeedItem } from './feed';
export type { Monitor } from './monitor';
