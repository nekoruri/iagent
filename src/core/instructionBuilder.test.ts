import { describe, it, expect } from 'vitest';
import { buildMainInstructions, buildHeartbeatInstructions, buildWorkerHeartbeatPrompt } from './instructionBuilder';
import type { InstructionContext } from './instructionBuilder';
import { getDefaultPersonaConfig } from './config';
import type { Memory } from '../types';

function makeContext(overrides?: Partial<InstructionContext>): InstructionContext {
  return {
    persona: getDefaultPersonaConfig(),
    memories: [],
    currentDateTime: '2026/2/26 12:00:00',
    ...overrides,
  };
}

function makeMemory(overrides?: Partial<Memory>): Memory {
  return {
    id: 'mem-1',
    content: 'テスト用メモリ',
    category: 'fact',
    importance: 3,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    accessCount: 0,
    lastAccessedAt: Date.now(),
    contentHash: '',
    ...overrides,
  };
}

describe('buildMainInstructions', () => {
  it('デフォルトペルソナ名 iAgent を含む', () => {
    const result = buildMainInstructions(makeContext());
    expect(result).toContain('iAgent');
  });

  it('カスタムペルソナ名を含む', () => {
    const result = buildMainInstructions(makeContext({
      persona: { ...getDefaultPersonaConfig(), name: 'MyBot' },
    }));
    expect(result).toContain('MyBot');
    expect(result).not.toContain('あなたはiAgentです');
  });

  it('personality 設定時に含まれる', () => {
    const result = buildMainInstructions(makeContext({
      persona: { ...getDefaultPersonaConfig(), personality: '丁寧で親しみやすい' },
    }));
    expect(result).toContain('丁寧で親しみやすい');
  });

  it('personality 未設定時に「性格・特徴」セクションが含まれない', () => {
    const result = buildMainInstructions(makeContext());
    expect(result).not.toContain('性格・特徴:');
  });

  it('tone 設定時に含まれる', () => {
    const result = buildMainInstructions(makeContext({
      persona: { ...getDefaultPersonaConfig(), tone: 'カジュアル' },
    }));
    expect(result).toContain('カジュアル');
  });

  it('customInstructions 設定時に含まれる', () => {
    const result = buildMainInstructions(makeContext({
      persona: { ...getDefaultPersonaConfig(), customInstructions: '常に英語で回答' },
    }));
    expect(result).toContain('常に英語で回答');
    expect(result).toContain('ユーザーからの追加指示');
  });

  it('全7ツール名を含む', () => {
    const result = buildMainInstructions(makeContext());
    expect(result).toContain('calendar');
    expect(result).toContain('web_search');
    expect(result).toContain('device_info');
    expect(result).toContain('memory');
    expect(result).toContain('clip');
    expect(result).toContain('feed');
    expect(result).toContain('web_monitor');
  });

  it('タスク実行方針を含む', () => {
    const result = buildMainInstructions(makeContext());
    expect(result).toContain('タスク実行方針');
    expect(result).toContain('必要なステップを特定する');
  });

  it('メモリ管理ガイドラインを含む', () => {
    const result = buildMainInstructions(makeContext());
    expect(result).toContain('メモリ管理ガイドライン');
    expect(result).toContain('routine');
    expect(result).toContain('goal');
    expect(result).toContain('personality');
    expect(result).toContain('reflection');
  });

  it('プロアクティブ行動を含む', () => {
    const result = buildMainInstructions(makeContext());
    expect(result).toContain('プロアクティブ行動');
  });

  it('通常メモリコンテキストを含む', () => {
    const memories = [
      makeMemory({ content: 'ユーザーは東京在住', category: 'fact' }),
      makeMemory({ id: 'mem-2', content: '朝7時に起床', category: 'routine' }),
    ];
    const result = buildMainInstructions(makeContext({ memories }));
    expect(result).toContain('あなたの記憶');
    expect(result).toContain('[fact] ユーザーは東京在住');
    expect(result).toContain('[routine] 朝7時に起床');
  });

  it('reflection メモリは「振り返りからの洞察」セクションに分離表示される', () => {
    const memories = [
      makeMemory({ content: '通常のメモリ', category: 'fact' }),
      makeMemory({ id: 'mem-2', content: 'ユーザーは朝型', category: 'reflection' }),
    ];
    const result = buildMainInstructions(makeContext({ memories }));
    expect(result).toContain('あなたの記憶');
    expect(result).toContain('[fact] 通常のメモリ');
    expect(result).toContain('振り返りからの洞察');
    expect(result).toContain('[reflection] ユーザーは朝型');
  });

  it('reflection のみの場合は「あなたの記憶」セクションが含まれない', () => {
    const memories = [
      makeMemory({ content: '洞察のみ', category: 'reflection' }),
    ];
    const result = buildMainInstructions(makeContext({ memories }));
    expect(result).not.toContain('あなたの記憶');
    expect(result).toContain('振り返りからの洞察');
  });

  it('メモリ 0 件でもエラーにならない', () => {
    const result = buildMainInstructions(makeContext({ memories: [] }));
    expect(result).not.toContain('あなたの記憶');
    expect(result).not.toContain('振り返りからの洞察');
  });

  it('importance が 3 以外の場合に表示される', () => {
    const memories = [makeMemory({ content: '重要情報', importance: 5 })];
    const result = buildMainInstructions(makeContext({ memories }));
    expect(result).toContain('(重要度:5)');
  });

  it('importance が 3 の場合は表示されない', () => {
    const memories = [makeMemory({ content: 'デフォルト重要度', importance: 3 })];
    const result = buildMainInstructions(makeContext({ memories }));
    expect(result).not.toContain('(重要度:3)');
  });

  it('tags が表示される', () => {
    const memories = [makeMemory({ content: 'タグ付き', tags: ['tokyo', 'weather'] })];
    const result = buildMainInstructions(makeContext({ memories }));
    expect(result).toContain('#tokyo');
    expect(result).toContain('#weather');
  });

  it('日時コンテキストを含む', () => {
    const result = buildMainInstructions(makeContext({ currentDateTime: '2026/3/1 09:00:00' }));
    expect(result).toContain('2026/3/1 09:00:00');
  });
});

describe('buildHeartbeatInstructions', () => {
  it('デフォルトペルソナ名を含む', () => {
    const result = buildHeartbeatInstructions(makeContext());
    expect(result).toContain('iAgent');
  });

  it('カスタムペルソナ名を含む', () => {
    const result = buildHeartbeatInstructions(makeContext({
      persona: { ...getDefaultPersonaConfig(), name: 'カスタム' },
    }));
    expect(result).toContain('カスタム');
  });

  it('JSON 出力形式要件を含む', () => {
    const result = buildHeartbeatInstructions(makeContext());
    expect(result).toContain('"taskId"');
    expect(result).toContain('"hasChanges"');
    expect(result).toContain('"summary"');
    expect(result).toContain('JSON形式');
  });

  it('personality 設定時に反映される', () => {
    const result = buildHeartbeatInstructions(makeContext({
      persona: { ...getDefaultPersonaConfig(), personality: '冷静沈着' },
    }));
    expect(result).toContain('冷静沈着');
  });

  it('通常メモリコンテキストを含む', () => {
    const memories = [makeMemory({ content: 'テストメモリ', category: 'preference' })];
    const result = buildHeartbeatInstructions(makeContext({ memories }));
    expect(result).toContain('ユーザーについての記憶');
    expect(result).toContain('[preference] テストメモリ');
  });

  it('reflection メモリは「振り返りからの洞察」に分離表示される', () => {
    const memories = [
      makeMemory({ content: '通常メモリ', category: 'fact' }),
      makeMemory({ id: 'mem-2', content: 'パターン発見', category: 'reflection' }),
    ];
    const result = buildHeartbeatInstructions(makeContext({ memories }));
    expect(result).toContain('ユーザーについての記憶');
    expect(result).toContain('[fact] 通常メモリ');
    expect(result).toContain('振り返りからの洞察');
    expect(result).toContain('[reflection] パターン発見');
  });

  it('メモリ 0 件でも正常', () => {
    const result = buildHeartbeatInstructions(makeContext({ memories: [] }));
    expect(result).not.toContain('ユーザーについての記憶');
    expect(result).not.toContain('振り返りからの洞察');
  });
});

describe('buildWorkerHeartbeatPrompt', () => {
  it('buildHeartbeatInstructions と同じ結果を返す', () => {
    const ctx = makeContext();
    expect(buildWorkerHeartbeatPrompt(ctx)).toBe(buildHeartbeatInstructions(ctx));
  });

  it('ペルソナ名を含む', () => {
    const result = buildWorkerHeartbeatPrompt(makeContext({
      persona: { ...getDefaultPersonaConfig(), name: 'WorkerBot' },
    }));
    expect(result).toContain('WorkerBot');
  });
});
