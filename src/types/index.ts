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
  otel?: OtelConfig;
}

export interface Memory {
  id: string;
  content: string;
  category: 'preference' | 'fact' | 'context' | 'other';
  createdAt: number;
  updatedAt: number;
}

/** getConfigValue() で文字列として取得可能なキー */
export type ConfigKey = 'openaiApiKey' | 'braveApiKey' | 'openWeatherMapApiKey';
