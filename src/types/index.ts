export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
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

export interface AppConfig {
  openaiApiKey: string;
  braveApiKey: string;
  openWeatherMapApiKey: string;
}

export type ConfigKey = keyof AppConfig;
