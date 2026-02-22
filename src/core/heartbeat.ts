import { run, user } from '@openai/agents';
import { setDefaultOpenAIClient } from '@openai/agents-openai';
import OpenAI from 'openai';
import type { MCPServer } from '@openai/agents';
import { createHeartbeatAgent } from './agent';
import { getConfig } from './config';
import { loadHeartbeatState, addHeartbeatResult, updateLastChecked } from '../store/heartbeatStore';
import type { HeartbeatConfig, HeartbeatResult, HeartbeatTask } from '../types';

export type HeartbeatNotification = {
  results: HeartbeatResult[];
};

type Listener = (notification: HeartbeatNotification) => void;

/** 現在がサイレント時間帯かどうかを判定する */
export function isQuietHours(config: HeartbeatConfig, now?: Date): boolean {
  const hour = (now ?? new Date()).getHours();
  const { quietHoursStart, quietHoursEnd } = config;
  if (quietHoursStart <= quietHoursEnd) {
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }
  // 例: 23時〜6時のように日をまたぐ場合
  return hour >= quietHoursStart || hour < quietHoursEnd;
}

export class HeartbeatEngine {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private isAgentBusy = false;
  private isExecuting = false;
  private listeners: Listener[] = [];
  private getMCPServers: () => MCPServer[];

  constructor(getMCPServers: () => MCPServer[]) {
    this.getMCPServers = getMCPServers;
  }

  start(): void {
    if (this.timerId) return;
    this.isRunning = true;
    // 1分間隔でtick。各タスクの経過時間で実行判定
    this.timerId = setInterval(() => this.tick(), 60_000);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  setAgentBusy(busy: boolean): void {
    this.isAgentBusy = busy;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** フォアグラウンド復帰時などに即座にチェック */
  async runNow(): Promise<void> {
    await this.tick();
  }

  private notify(notification: HeartbeatNotification): void {
    for (const listener of this.listeners) {
      listener(notification);
    }
  }

  private async getTasksDue(config: HeartbeatConfig): Promise<HeartbeatTask[]> {
    const state = await loadHeartbeatState();
    const now = Date.now();
    const intervalMs = config.intervalMinutes * 60_000;
    const elapsed = now - state.lastChecked;
    if (elapsed < intervalMs) return [];
    return config.tasks.filter((t) => t.enabled);
  }

  private async tick(): Promise<void> {
    if (!this.isRunning || this.isAgentBusy || this.isExecuting) return;

    const config = getConfig().heartbeat;
    if (!config || !config.enabled) return;
    if (isQuietHours(config)) return;

    const tasks = await this.getTasksDue(config);
    if (tasks.length === 0) return;

    await this.executeCheck(tasks);
  }

  private async executeCheck(tasks: HeartbeatTask[]): Promise<void> {
    this.isExecuting = true;
    try {
      const apiKey = getConfig().openaiApiKey;
      if (!apiKey) return;

      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      setDefaultOpenAIClient(client);

      const mcpServers = this.getMCPServers();
      const agent = createHeartbeatAgent(mcpServers);

      const taskDescriptions = tasks.map((t) =>
        `- タスクID: ${t.id}, タスク名: ${t.name}, 内容: ${t.description}`
      ).join('\n');

      const prompt = `以下のタスクについてチェックを実行してください:\n${taskDescriptions}`;

      const result = await run(agent, [user(prompt)], { stream: false });
      const finalOutput = (result as { finalOutput?: unknown }).finalOutput;

      if (typeof finalOutput !== 'string') return;

      // JSON部分を抽出
      const jsonMatch = finalOutput.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const parsed = JSON.parse(jsonMatch[0]) as {
        results: Array<{ taskId: string; hasChanges: boolean; summary: string }>;
      };

      const now = Date.now();
      const heartbeatResults: HeartbeatResult[] = [];

      for (const r of parsed.results) {
        const hbResult: HeartbeatResult = {
          taskId: r.taskId,
          timestamp: now,
          hasChanges: r.hasChanges,
          summary: r.summary || '',
        };
        await addHeartbeatResult(hbResult);
        if (r.hasChanges) {
          heartbeatResults.push(hbResult);
        }
      }

      if (heartbeatResults.length > 0) {
        this.notify({ results: heartbeatResults });
      }
    } catch (error) {
      console.error('[Heartbeat] チェック実行エラー:', error);
      // エラー時も lastChecked を更新して即リトライを防止
      await updateLastChecked(Date.now()).catch(() => {});
    } finally {
      this.isExecuting = false;
    }
  }
}
