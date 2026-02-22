export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  source?: 'chat' | 'heartbeat';
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

export interface HeartbeatTask {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: 'builtin' | 'custom';
}

export interface HeartbeatResult {
  taskId: string;
  timestamp: number;
  hasChanges: boolean;
  summary: string;
}

export interface HeartbeatState {
  lastChecked: number;
  recentResults: HeartbeatResult[];
}

export interface HeartbeatConfig {
  enabled: boolean;
  intervalMinutes: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  tasks: HeartbeatTask[];
  desktopNotification: boolean;
}

export interface AppConfig {
  openaiApiKey: string;
  braveApiKey: string;
  openWeatherMapApiKey: string;
  mcpServers: MCPServerConfig[];
  heartbeat?: HeartbeatConfig;
}

/** getConfigValue() で文字列として取得可能なキー */
export type ConfigKey = 'openaiApiKey' | 'braveApiKey' | 'openWeatherMapApiKey';
