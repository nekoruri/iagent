import { describe, it, expect } from 'vitest';
import { buildMainInstructions, buildHeartbeatInstructions, buildWorkerHeartbeatPrompt, formatGoalsWithDeadlines } from './instructionBuilder';
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

  it('ブリーフィングタスク用ルールを含む', () => {
    const result = buildHeartbeatInstructions(makeContext());
    expect(result).toContain('ブリーフィングタスク');
    expect(result).toContain('briefing-');
    expect(result).toContain('総合サマリー');
  });

  it('goal メモリは「目標・締切」セクションに分離表示される', () => {
    const memories = [
      makeMemory({ content: '3月末までにレポート提出', category: 'goal' }),
      makeMemory({ id: 'mem-2', content: '通常メモリ', category: 'fact' }),
    ];
    const result = buildHeartbeatInstructions(makeContext({ memories }));
    expect(result).toContain('目標・締切');
    expect(result).toContain('[goal] 3月末までにレポート提出');
    expect(result).toContain('ユーザーについての記憶');
    expect(result).toContain('[fact] 通常メモリ');
  });

  it('context メモリは「現在の状況」セクションに分離表示される', () => {
    const memories = [
      makeMemory({ content: 'プロジェクトXに取り組み中', category: 'context' }),
      makeMemory({ id: 'mem-2', content: '通常メモリ', category: 'fact' }),
    ];
    const result = buildHeartbeatInstructions(makeContext({ memories }));
    expect(result).toContain('現在の状況');
    expect(result).toContain('[context] プロジェクトXに取り組み中');
  });

  it('goal/context/reflection すべて分離される', () => {
    const memories = [
      makeMemory({ id: 'mem-1', content: '目標情報', category: 'goal' }),
      makeMemory({ id: 'mem-2', content: '状況情報', category: 'context' }),
      makeMemory({ id: 'mem-3', content: '洞察情報', category: 'reflection' }),
      makeMemory({ id: 'mem-4', content: '一般情報', category: 'fact' }),
    ];
    const result = buildHeartbeatInstructions(makeContext({ memories }));
    expect(result).toContain('目標・締切');
    expect(result).toContain('現在の状況');
    expect(result).toContain('ユーザーについての記憶');
    expect(result).toContain('振り返りからの洞察');
  });

  it('ブリーフィングルールに目標参照の指示が含まれる', () => {
    const result = buildHeartbeatInstructions(makeContext());
    expect(result).toContain('目標（goal）と現在の状況（context）を踏まえて');
    expect(result).toContain('残り日数を計算');
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

describe('formatGoalsWithDeadlines', () => {
  const dateTime = '2026/3/1 12:00:00';

  it('残り日数が表示される', () => {
    const goals = [makeMemory({ content: '3月末までにレポート提出', category: 'goal' })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).toContain('(残り30日)');
    expect(result).toContain('#deadline');
  });

  it('期限超過が表示される', () => {
    const goals = [makeMemory({ content: '2026年2月20日までに提出', category: 'goal' })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).toContain('⚠ 期限超過 9日');
    expect(result).toContain('#deadline');
  });

  it('本日期限が表示される', () => {
    const goals = [makeMemory({ content: '2026年3月1日が締切', category: 'goal' })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).toContain('⚠ 本日期限');
    expect(result).toContain('#deadline');
  });

  it('パース不可の goal はそのまま表示される', () => {
    const goals = [makeMemory({ content: 'プロジェクトXの完了', category: 'goal' })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).toContain('[goal] プロジェクトXの完了');
    expect(result).not.toContain('残り');
    expect(result).not.toContain('#deadline');
  });

  it('importance が併記される', () => {
    const goals = [makeMemory({ content: '3月末までにレポート提出', category: 'goal', importance: 5 })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).toContain('(残り30日)');
    expect(result).toContain('(重要度:5)');
  });
});

describe('活動状態ラベル (F11/F12)', () => {
  const dateTime = '2026/3/1 12:00:00';
  const nowMs = new Date('2026-3-1 12:00:00').getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('7日以上更新なしでナッジラベルが付く', () => {
    const goals = [makeMemory({
      content: 'React Hooks の学習',
      category: 'goal',
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 10 * DAY_MS,
    })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).toContain('(10日間更新なし)');
    expect(result).toContain('#stale');
    expect(result).not.toContain('⚠');
  });

  it('14日以上更新なしで警告ラベルが付く', () => {
    const goals = [makeMemory({
      content: 'TypeScript マスター',
      category: 'goal',
      createdAt: nowMs - 60 * DAY_MS,
      updatedAt: nowMs - 20 * DAY_MS,
    })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).toContain('(⚠ 20日間更新なし)');
    expect(result).toContain('#stale');
  });

  it('7日未満の更新ではラベルなし', () => {
    const goals = [makeMemory({
      content: 'アクティブな目標',
      category: 'goal',
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 5 * DAY_MS,
    })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).not.toContain('日間更新なし');
    expect(result).not.toContain('#stale');
  });

  it('作成後3日以内は猶予期間でラベルなし', () => {
    const goals = [makeMemory({
      content: '新しい目標',
      category: 'goal',
      createdAt: nowMs - 2 * DAY_MS,
      updatedAt: nowMs - 2 * DAY_MS,
    })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).not.toContain('日間更新なし');
    expect(result).not.toContain('#stale');
  });

  it('作成後3日経過で未更新ならラベルあり', () => {
    const goals = [makeMemory({
      content: '放置された目標',
      category: 'goal',
      createdAt: nowMs - 10 * DAY_MS,
      updatedAt: nowMs - 10 * DAY_MS,
    })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).toContain('(10日間更新なし)');
    expect(result).toContain('#stale');
  });

  it('deadline と活動状態ラベルが併記される', () => {
    const goals = [makeMemory({
      content: '3月末までにレポート提出',
      category: 'goal',
      importance: 5,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 14 * DAY_MS,
    })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).toContain('(残り30日)');
    expect(result).toContain('(⚠ 14日間更新なし)');
    expect(result).toContain('#deadline');
    expect(result).toContain('#stale');
    expect(result).toContain('(重要度:5)');
  });

  it('最近更新された goal にはラベルなし', () => {
    const goals = [makeMemory({
      content: 'アクティブな目標',
      category: 'goal',
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 1 * DAY_MS,
    })];
    const result = formatGoalsWithDeadlines(goals, dateTime);
    expect(result).not.toContain('日間更新なし');
    expect(result).not.toContain('#stale');
  });
});

describe('期日表示の統合テスト', () => {
  it('Heartbeat: goal に残り日数が付く', () => {
    const memories = [
      makeMemory({ content: '3月末までにレポート提出', category: 'goal' }),
      makeMemory({ id: 'mem-2', content: '通常メモリ', category: 'fact' }),
    ];
    const result = buildHeartbeatInstructions(makeContext({
      memories,
      currentDateTime: '2026/3/1 12:00:00',
    }));
    expect(result).toContain('(残り30日)');
    expect(result).toContain('#deadline');
    expect(result).not.toContain('[fact] 通常メモリ (残り');
  });

  it('Main: goal に残り日数が付き、fact には付かない', () => {
    const memories = [
      makeMemory({ content: '3月末までにレポート提出', category: 'goal' }),
      makeMemory({ id: 'mem-2', content: '通常メモリ', category: 'fact' }),
    ];
    const result = buildMainInstructions(makeContext({
      memories,
      currentDateTime: '2026/3/1 12:00:00',
    }));
    expect(result).toContain('目標・締切');
    expect(result).toContain('(残り30日)');
    expect(result).toContain('[fact] 通常メモリ');
    expect(result).not.toContain('[fact] 通常メモリ (残り');
  });
});

describe('活動状態ラベルの統合テスト (F11/F12)', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const nowMs = new Date('2026-3-1 12:00:00').getTime();

  it('Heartbeat: stale な goal にラベルと #stale が付く', () => {
    const memories = [
      makeMemory({
        content: 'React Hooks の学習',
        category: 'goal',
        createdAt: nowMs - 30 * DAY_MS,
        updatedAt: nowMs - 10 * DAY_MS,
      }),
    ];
    const result = buildHeartbeatInstructions(makeContext({
      memories,
      currentDateTime: '2026/3/1 12:00:00',
    }));
    expect(result).toContain('(10日間更新なし)');
    expect(result).toContain('#stale');
  });

  it('Heartbeat: ブリーフィングルールにナッジ指示が含まれる', () => {
    const result = buildHeartbeatInstructions(makeContext());
    expect(result).toContain('#stale');
    expect(result).toContain('後押し');
    expect(result).toContain('見直し');
  });

  it('Main: stale な goal にラベルが付き、fact には付かない', () => {
    const memories = [
      makeMemory({
        content: 'TypeScript マスター',
        category: 'goal',
        createdAt: nowMs - 30 * DAY_MS,
        updatedAt: nowMs - 8 * DAY_MS,
      }),
      makeMemory({ id: 'mem-2', content: '通常メモリ', category: 'fact' }),
    ];
    const result = buildMainInstructions(makeContext({
      memories,
      currentDateTime: '2026/3/1 12:00:00',
    }));
    expect(result).toContain('(8日間更新なし)');
    expect(result).toContain('#stale');
    expect(result).toContain('[fact] 通常メモリ');
    expect(result).not.toContain('[fact] 通常メモリ (');
    expect(result).not.toContain('[fact] 通常メモリ #stale');
  });
});
