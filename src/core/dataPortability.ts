import { z } from 'zod';
import { getConfig, saveConfig } from './config';
import { getDB } from '../store/db';
import { saveConfigToIDB } from '../store/configStore';
import { normalizeStoredAttachment, toStoredAttachmentRow, type StoredAttachmentRow } from '../store/attachmentStore';
import type { AppConfig, ChatMessage, Conversation, Memory, ArchivedMemory } from '../types';
import type { Attachment } from '../types/attachment';

export const DATA_PORTABILITY_FORMAT = 'iagent-data-export';
export const DATA_PORTABILITY_SCHEMA_VERSION = 1 as const;

const memoryCategorySchema = z.enum([
  'preference',
  'fact',
  'context',
  'routine',
  'goal',
  'personality',
  'reflection',
  'other',
]);

const toolCallInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['running', 'completed', 'error']),
  args: z.string().optional(),
  result: z.string().optional(),
}).passthrough();

const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number().finite(),
  toolCalls: z.array(toolCallInfoSchema).optional(),
  source: z.enum(['chat', 'heartbeat']).optional(),
  conversationId: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
}).passthrough();

const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  messageCount: z.number().int().nonnegative(),
}).passthrough();

const baseMemorySchema = z.object({
  id: z.string(),
  content: z.string(),
  category: memoryCategorySchema.catch('other'),
  importance: z.number().int().min(1).max(5).optional().default(3),
  tags: z.array(z.string()).optional().default([]),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  accessCount: z.number().int().nonnegative().optional().default(0),
  lastAccessedAt: z.number().finite().optional().default(0),
  contentHash: z.string().optional().default(''),
}).passthrough();

const memorySchema = baseMemorySchema;

const archivedMemorySchema = baseMemorySchema.extend({
  archivedAt: z.number().finite(),
  archiveReason: z.enum(['low-score', 'manual', 'consolidation']).optional().default('low-score'),
}).passthrough();

const attachmentSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  dataUri: z.string(),
  thumbnailUri: z.string().optional(),
  createdAt: z.number().finite(),
}).passthrough();

const taskScheduleSchema = z.object({
  type: z.enum(['global', 'interval', 'fixed-time']),
  intervalMinutes: z.number().finite().optional(),
  hour: z.number().finite().optional(),
  minute: z.number().finite().optional(),
}).passthrough();

const heartbeatTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  type: z.enum(['builtin', 'custom']),
  schedule: taskScheduleSchema.optional(),
  allowedMcpTools: z.array(z.string()).optional(),
}).passthrough();

const heartbeatCostControlSchema = z.object({
  enabled: z.boolean(),
  dailyTokenBudget: z.number().finite(),
  pressureThreshold: z.number().finite(),
  deferNonCriticalTasks: z.boolean(),
}).passthrough();

const heartbeatConfigSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().finite(),
  quietHoursStart: z.number().finite(),
  quietHoursEnd: z.number().finite(),
  quietDays: z.array(z.number().int()),
  maxNotificationsPerDay: z.number().int(),
  tasks: z.array(heartbeatTaskSchema),
  desktopNotification: z.boolean(),
  focusMode: z.boolean(),
  costControl: heartbeatCostControlSchema.optional(),
}).passthrough();

const mcpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  enabled: z.boolean(),
}).passthrough();

const pushConfigSchema = z.object({
  enabled: z.boolean(),
  serverUrl: z.string(),
}).passthrough();

const proxyConfigSchema = z.object({
  enabled: z.boolean(),
  serverUrl: z.string(),
  authToken: z.string(),
  allowedDomains: z.array(z.string()),
}).passthrough();

const otelConfigSchema = z.object({
  enabled: z.boolean(),
  endpoint: z.string(),
  headers: z.record(z.string(), z.string()),
  batchSize: z.number().int().positive(),
  flushIntervalMs: z.number().int().positive(),
}).passthrough();

const personaConfigSchema = z.object({
  name: z.string(),
  personality: z.string(),
  tone: z.string(),
  customInstructions: z.string(),
}).passthrough();

const webSpeechConfigSchema = z.object({
  sttEnabled: z.boolean(),
  ttsEnabled: z.boolean(),
  ttsAutoRead: z.boolean(),
  lang: z.string(),
  ttsRate: z.number().finite(),
}).passthrough();

const appConfigSchema = z.object({
  openaiApiKey: z.string().default(''),
  braveApiKey: z.string().default(''),
  openWeatherMapApiKey: z.string().default(''),
  mcpServers: z.array(mcpServerSchema).default([]),
  heartbeat: heartbeatConfigSchema.optional(),
  push: pushConfigSchema.optional(),
  proxy: proxyConfigSchema.optional(),
  otel: otelConfigSchema.optional(),
  persona: personaConfigSchema.optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  suggestionFrequency: z.enum(['high', 'medium', 'low']).optional(),
  webSpeech: webSpeechConfigSchema.optional(),
}).passthrough();

const dataPortabilityExportSchema = z.object({
  format: z.literal(DATA_PORTABILITY_FORMAT),
  schemaVersion: z.literal(DATA_PORTABILITY_SCHEMA_VERSION),
  exportedAt: z.number().int().nonnegative(),
  config: appConfigSchema,
  conversationMeta: z.array(conversationSchema).default([]),
  conversations: z.array(chatMessageSchema).default([]),
  memories: z.array(memorySchema).default([]),
  archivedMemories: z.array(archivedMemorySchema).default([]),
  attachments: z.array(attachmentSchema).default([]),
}).passthrough();

export type DataPortabilityExport = {
  format: typeof DATA_PORTABILITY_FORMAT;
  schemaVersion: typeof DATA_PORTABILITY_SCHEMA_VERSION;
  exportedAt: number;
  config: AppConfig;
  conversationMeta: Conversation[];
  conversations: ChatMessage[];
  memories: Memory[];
  archivedMemories: ArchivedMemory[];
  attachments: Attachment[];
};

export interface DataPortabilityCounts {
  conversationMeta: number;
  conversations: number;
  memories: number;
  archivedMemories: number;
  attachments: number;
}

export interface DataPortabilityExportResult {
  payload: DataPortabilityExport;
  json: string;
  filename: string;
  bytes: number;
  counts: DataPortabilityCounts;
}

export interface DataPortabilityImportResult {
  importedAt: number;
  counts: DataPortabilityCounts;
}

function sortAscending<T>(items: T[], getValue: (item: T) => number): T[] {
  return [...items].sort((a, b) => getValue(a) - getValue(b));
}

function normalizeExport(
  parsed: z.output<typeof dataPortabilityExportSchema>,
): DataPortabilityExport {
  const normalizedMemories = (parsed.memories as Memory[]).map((memory) => ({
    ...memory,
    importance: Number.isFinite(memory.importance) ? memory.importance : 3,
    tags: Array.isArray(memory.tags) ? memory.tags : [],
    accessCount: Number.isFinite(memory.accessCount) ? memory.accessCount : 0,
    lastAccessedAt: Number.isFinite(memory.lastAccessedAt) && memory.lastAccessedAt > 0
      ? memory.lastAccessedAt
      : memory.updatedAt,
    contentHash: memory.contentHash ?? '',
  }));
  const normalizedArchived = (parsed.archivedMemories as ArchivedMemory[]).map((memory) => ({
    ...memory,
    importance: Number.isFinite(memory.importance) ? memory.importance : 3,
    tags: Array.isArray(memory.tags) ? memory.tags : [],
    accessCount: Number.isFinite(memory.accessCount) ? memory.accessCount : 0,
    lastAccessedAt: Number.isFinite(memory.lastAccessedAt) && memory.lastAccessedAt > 0
      ? memory.lastAccessedAt
      : memory.updatedAt,
    contentHash: memory.contentHash ?? '',
  }));
  return {
    format: parsed.format,
    schemaVersion: parsed.schemaVersion,
    exportedAt: parsed.exportedAt,
    config: parsed.config as AppConfig,
    conversationMeta: sortAscending(parsed.conversationMeta as Conversation[], (v) => v.createdAt),
    conversations: sortAscending(parsed.conversations as ChatMessage[], (v) => v.timestamp),
    memories: sortAscending(normalizedMemories, (v) => v.updatedAt),
    archivedMemories: sortAscending(normalizedArchived, (v) => v.archivedAt),
    attachments: sortAscending(parsed.attachments as Attachment[], (v) => v.createdAt),
  };
}

export function getDataPortabilityCounts(data: Pick<DataPortabilityExport,
  'conversationMeta' | 'conversations' | 'memories' | 'archivedMemories' | 'attachments'
>): DataPortabilityCounts {
  return {
    conversationMeta: data.conversationMeta.length,
    conversations: data.conversations.length,
    memories: data.memories.length,
    archivedMemories: data.archivedMemories.length,
    attachments: data.attachments.length,
  };
}

function toSerializableRows<T extends object>(rows: T[]): Array<Record<string, unknown>> {
  return rows as Array<Record<string, unknown>>;
}

export async function createDataPortabilityExport(exportedAt = Date.now()): Promise<DataPortabilityExport> {
  const db = await getDB();
  const [conversationMeta, conversations, memories, archivedMemories, rawAttachmentRows] = await Promise.all([
    db.getAll('conversation-meta'),
    db.getAll('conversations'),
    db.getAll('memories'),
    db.getAll('memories_archive'),
    db.getAll('attachments'),
  ]);
  const attachmentRows = rawAttachmentRows as StoredAttachmentRow[];
  const attachments = (await Promise.all(attachmentRows.map((row) => normalizeStoredAttachment(row))))
    .filter((row): row is Attachment => row !== null);

  const parsed = dataPortabilityExportSchema.parse({
    format: DATA_PORTABILITY_FORMAT,
    schemaVersion: DATA_PORTABILITY_SCHEMA_VERSION,
    exportedAt,
    config: getConfig(),
    conversationMeta,
    conversations,
    memories,
    archivedMemories,
    attachments,
  });

  return normalizeExport(parsed);
}

export function createDataPortabilityFilename(exportedAt = Date.now()): string {
  const d = new Date(exportedAt);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `iagent-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
}

export function stringifyDataPortabilityExport(payload: DataPortabilityExport): string {
  const parsed = dataPortabilityExportSchema.parse(payload);
  return JSON.stringify(parsed, null, 2);
}

export function parseDataPortabilityJson(raw: string): DataPortabilityExport {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error('バックアップ JSON の解析に失敗しました。');
  }
  const parsed = dataPortabilityExportSchema.parse(parsedJson);
  return normalizeExport(parsed);
}

export async function importDataPortability(payload: DataPortabilityExport): Promise<DataPortabilityImportResult> {
  const parsed = normalizeExport(dataPortabilityExportSchema.parse(payload));
  const db = await getDB();

  await Promise.all([
    db.clear('conversation-meta'),
    db.clear('conversations'),
    db.clear('memories'),
    db.clear('memories_archive'),
    db.clear('attachments'),
  ]);
  for (const row of toSerializableRows(parsed.conversationMeta)) {
    await db.put('conversation-meta', row);
  }
  for (const row of toSerializableRows(parsed.conversations)) {
    await db.put('conversations', row);
  }
  for (const row of toSerializableRows(parsed.memories)) {
    await db.put('memories', row);
  }
  for (const row of toSerializableRows(parsed.archivedMemories)) {
    await db.put('memories_archive', row);
  }
  for (const row of parsed.attachments) {
    await db.put('attachments', toStoredAttachmentRow(row));
  }

  saveConfig(parsed.config);
  await saveConfigToIDB(parsed.config);

  return {
    importedAt: Date.now(),
    counts: getDataPortabilityCounts(parsed),
  };
}

export async function importDataPortabilityFromJson(raw: string): Promise<DataPortabilityImportResult> {
  const parsed = parseDataPortabilityJson(raw);
  return importDataPortability(parsed);
}

export async function exportDataPortability(exportedAt = Date.now()): Promise<DataPortabilityExportResult> {
  const payload = await createDataPortabilityExport(exportedAt);
  const json = stringifyDataPortabilityExport(payload);
  return {
    payload,
    json,
    filename: createDataPortabilityFilename(payload.exportedAt),
    bytes: new Blob([json]).size,
    counts: getDataPortabilityCounts(payload),
  };
}

export function getDataPortabilityErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    if (!issue) return 'バックアップ形式が不正です。';
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `バックアップ形式が不正です（${path}${issue.message}）。`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'データ移行中に不明なエラーが発生しました。';
}
