import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppConfig, ChatMessage, Conversation, Memory, ArchivedMemory } from '../types';
import type { Attachment } from '../types/attachment';
import { __resetStores, getDB } from '../store/__mocks__/db';
import { toStoredAttachmentRow } from '../store/attachmentStore';
import {
  DATA_PORTABILITY_FORMAT,
  DATA_PORTABILITY_SCHEMA_VERSION,
  createDataPortabilityExport,
  createDataPortabilityFilename,
  getDataPortabilityCounts,
  parseDataPortabilityJson,
  importDataPortabilityFromJson,
} from './dataPortability';

vi.mock('../store/db', async () => await import('../store/__mocks__/db'));
vi.mock('./config', () => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../store/configStore', () => ({
  saveConfigToIDB: vi.fn(async () => {}),
}));

function makeConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    openaiApiKey: 'sk-test',
    braveApiKey: '',
    openWeatherMapApiKey: '',
    mcpServers: [],
    ...overrides,
  };
}

function makeConversation(id: string, createdAt: number): Conversation {
  return {
    id,
    title: id,
    createdAt,
    updatedAt: createdAt + 1,
    messageCount: 1,
  };
}

function makeMessage(id: string, timestamp: number, conversationId: string): ChatMessage {
  return {
    id,
    role: 'user',
    content: id,
    timestamp,
    conversationId,
  };
}

function makeMemory(id: string, updatedAt: number): Memory {
  return {
    id,
    content: id,
    category: 'fact',
    importance: 3,
    tags: [],
    createdAt: updatedAt - 10,
    updatedAt,
    accessCount: 0,
    lastAccessedAt: updatedAt,
    contentHash: '',
  };
}

function makeArchivedMemory(id: string, archivedAt: number): ArchivedMemory {
  return {
    ...makeMemory(id, archivedAt - 10),
    archivedAt,
    archiveReason: 'manual',
  };
}

function makeAttachment(id: string, createdAt: number, messageId: string, conversationId: string): Attachment {
  return {
    id,
    messageId,
    conversationId,
    filename: `${id}.txt`,
    mimeType: 'text/plain',
    size: 1,
    dataUri: 'data:text/plain;base64,QQ==',
    createdAt,
  };
}

describe('dataPortability', () => {
  beforeEach(async () => {
    __resetStores();
    vi.clearAllMocks();
    const { getConfig } = await import('./config');
    vi.mocked(getConfig).mockReturnValue(makeConfig());
  });

  it('createDataPortabilityExport は対象データを収集しソートして返す', async () => {
    const db = await getDB();
    await db.put('conversation-meta', makeConversation('conv-b', 20));
    await db.put('conversation-meta', makeConversation('conv-a', 10));
    await db.put('conversations', makeMessage('msg-b', 30, 'conv-b'));
    await db.put('conversations', makeMessage('msg-a', 15, 'conv-a'));
    // legacy 形式（importance など不足）もエクスポートできること
    await db.put('memories', {
      id: 'legacy-memory',
      content: 'legacy',
      category: 'fact',
      createdAt: 100,
      updatedAt: 110,
    });
    await db.put('memories_archive', makeArchivedMemory('arch-1', 200));
    await db.put('attachments', makeAttachment('att-1', 40, 'msg-a', 'conv-a'));

    const exported = await createDataPortabilityExport(1_700_000_000_000);

    expect(exported.format).toBe(DATA_PORTABILITY_FORMAT);
    expect(exported.schemaVersion).toBe(DATA_PORTABILITY_SCHEMA_VERSION);
    expect(exported.exportedAt).toBe(1_700_000_000_000);
    expect(exported.conversationMeta.map((v) => v.id)).toEqual(['conv-a', 'conv-b']);
    expect(exported.conversations.map((v) => v.id)).toEqual(['msg-a', 'msg-b']);
    expect(exported.memories[0].importance).toBe(3);
    expect(exported.memories[0].tags).toEqual([]);
    expect(exported.memories[0].lastAccessedAt).toBe(110);
    expect(exported.memories[0].contentHash).toBe('');
    expect(getDataPortabilityCounts(exported)).toEqual({
      conversationMeta: 2,
      conversations: 2,
      memories: 1,
      archivedMemories: 1,
      attachments: 1,
    });
  });

  it('createDataPortabilityExport は Blob 保存された添付も dataUri 形式でエクスポートする', async () => {
    const db = await getDB();
    const attachment = makeAttachment('att-blob', 40, 'msg-a', 'conv-a');
    await db.put('attachments', toStoredAttachmentRow(attachment));

    const exported = await createDataPortabilityExport(1_700_000_000_000);
    expect(exported.attachments).toHaveLength(1);
    expect(exported.attachments[0].id).toBe('att-blob');
    expect(exported.attachments[0].dataUri).toBe(attachment.dataUri);
  });

  it('createDataPortabilityFilename は日時付きファイル名を生成する', () => {
    const ts = new Date(2026, 0, 2, 3, 4, 5).getTime();
    expect(createDataPortabilityFilename(ts)).toBe('iagent-backup-20260102-030405.json');
  });

  it('parseDataPortabilityJson は不正 JSON を拒否する', () => {
    expect(() => parseDataPortabilityJson('{invalid')).toThrow('バックアップ JSON の解析に失敗しました。');
  });

  it('importDataPortabilityFromJson は既存データを置換して復元する', async () => {
    const db = await getDB();
    await db.put('conversation-meta', makeConversation('old-conv', 1));
    await db.put('conversations', makeMessage('old-msg', 1, 'old-conv'));
    await db.put('memories', makeMemory('old-memory', 1));

    const importedConfig = makeConfig({ openaiApiKey: 'sk-imported' });
    const payload = {
      format: DATA_PORTABILITY_FORMAT,
      schemaVersion: DATA_PORTABILITY_SCHEMA_VERSION,
      exportedAt: 1_700_000_000_123,
      config: importedConfig,
      conversationMeta: [makeConversation('new-conv', 10)],
      conversations: [makeMessage('new-msg', 20, 'new-conv')],
      memories: [makeMemory('new-memory', 30)],
      archivedMemories: [makeArchivedMemory('new-arch', 40)],
      attachments: [makeAttachment('new-att', 50, 'new-msg', 'new-conv')],
    };

    const result = await importDataPortabilityFromJson(JSON.stringify(payload));

    expect((await db.getAll('conversation-meta')).map((v) => (v as Conversation).id)).toEqual(['new-conv']);
    expect((await db.getAll('conversations')).map((v) => (v as ChatMessage).id)).toEqual(['new-msg']);
    expect((await db.getAll('memories')).map((v) => (v as Memory).id)).toEqual(['new-memory']);
    expect((await db.getAll('memories_archive')).map((v) => (v as ArchivedMemory).id)).toEqual(['new-arch']);
    expect((await db.getAll('attachments')).map((v) => (v as Attachment).id)).toEqual(['new-att']);
    const importedAttachment = (await db.getAll('attachments'))[0] as Record<string, unknown>;
    expect(importedAttachment.dataBlob).toBeInstanceOf(Blob);
    expect(importedAttachment.dataUri).toBeUndefined();

    const { saveConfig } = await import('./config');
    const { saveConfigToIDB } = await import('../store/configStore');
    expect(saveConfig).toHaveBeenCalledWith(importedConfig);
    expect(saveConfigToIDB).toHaveBeenCalledWith(importedConfig);
    expect(result.counts).toEqual({
      conversationMeta: 1,
      conversations: 1,
      memories: 1,
      archivedMemories: 1,
      attachments: 1,
    });
  });

  it('attachments/archivedMemories がない旧形式 JSON も読み込める', async () => {
    const payload = {
      format: DATA_PORTABILITY_FORMAT,
      schemaVersion: DATA_PORTABILITY_SCHEMA_VERSION,
      exportedAt: 1_700_000_000_000,
      config: makeConfig(),
      conversationMeta: [makeConversation('conv-1', 1)],
      conversations: [makeMessage('msg-1', 2, 'conv-1')],
      memories: [makeMemory('mem-1', 3)],
    };

    const result = await importDataPortabilityFromJson(JSON.stringify(payload));
    expect(result.counts.archivedMemories).toBe(0);
    expect(result.counts.attachments).toBe(0);
  });
});
