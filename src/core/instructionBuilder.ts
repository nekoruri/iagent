import type { Memory, PersonaConfig } from '../types';

export interface InstructionContext {
  persona: PersonaConfig;
  memories: Memory[];
  currentDateTime: string;
  isHeartbeat?: boolean;
}

/** メインエージェント用 instructions を構築する */
export function buildMainInstructions(ctx: InstructionContext): string {
  const sections: string[] = [];

  // 1. ペルソナセクション
  sections.push(buildPersonaSection(ctx.persona));

  // 2. ツール使用ガイド
  sections.push(`## ツール使用ガイド
以下のツールを使用してユーザーを支援できます:
- **calendar**: カレンダーの予定を管理（追加・一覧・削除）
- **web_search**: Web検索で最新情報を取得
- **device_info**: デバイス情報や天気情報を取得
- **memory**: 長期メモリの保存・検索・管理
- **clip**: Webページやテキストのクリッピング（構造化保存）
- **feed**: RSSフィード購読の管理と記事取得
- **web_monitor**: Webページの変化監視

ツールを活用し、ユーザーの依頼に最適な方法で応えてください。`);

  // 3. タスク実行方針
  sections.push(`## タスク実行方針
複数のステップが必要なタスクでは、以下の手順で進めてください:
1. まずユーザーの依頼を分析し、必要なステップを特定する
2. 各ステップで適切なツールを呼び出す
3. 前のステップの結果を踏まえて次のステップを実行する
4. すべてのステップが完了したら、結果を統合してわかりやすく報告する

例: 「明日の予定を確認して、天気も調べて」
→ カレンダーツールで予定確認 → デバイス情報ツールで天気取得 → 統合して報告`);

  // 4. メモリ管理ガイドライン
  sections.push(`## メモリ管理ガイドライン
ユーザーとの会話で重要な情報を発見したら、memory ツールの save アクションで保存してください。

**カテゴリの使い分け**:
- preference: ユーザーの好み・嗜好
- fact: 事実情報（住所、名前など）
- context: 状況・文脈
- routine: ユーザーの日課・習慣
- goal: ユーザーの目標・締切
- personality: エージェントの振る舞い指示
- reflection: 振り返りで得た洞察やパターン

**重要度（importance 1-5）**:
- 5: 絶対に忘れてはいけない情報（名前、重要な締切等）
- 3: 一般的な情報（デフォルト）
- 1: 一時的な文脈情報

**タグ**: 関連するキーワードをタグとして付与すると、後から検索しやすくなります。

**保存タイミング**: ユーザーが明示的に「覚えて」と言った場合はもちろん、会話の中で重要な事実や好みを発見したら自発的に保存してください。
既に保存済みの情報を更新する場合は、古いメモリを delete してから新しい内容で save してください。`);

  // 5. プロアクティブ行動
  sections.push(`## プロアクティブ行動
以下の場面では自発的に行動してください:
- ユーザーの発言から好みや重要な事実を検出したら、確認の上メモリに保存
- 関連する過去の記憶がある場合は、会話に自然に組み込む
- ユーザーの目標や日課に関連する情報を提供できる場合は積極的に提案`);

  // 6. コンテキスト
  const contextParts: string[] = [`## コンテキスト\n現在の日時: ${ctx.currentDateTime}`];
  const regularMemories = ctx.memories.filter((m) => m.category !== 'reflection');
  const reflections = ctx.memories.filter((m) => m.category === 'reflection');
  if (regularMemories.length > 0) {
    contextParts.push(`\n### あなたの記憶\n以下はこれまでに保存した重要な情報です:\n${formatMemories(regularMemories)}`);
  }
  if (reflections.length > 0) {
    contextParts.push(`\n### 振り返りからの洞察\n${formatMemories(reflections)}`);
  }
  sections.push(contextParts.join(''));

  return sections.join('\n\n');
}

/** Heartbeat エージェント用 instructions を構築する */
export function buildHeartbeatInstructions(ctx: InstructionContext): string {
  const sections: string[] = [];

  // ペルソナ
  const personaName = ctx.persona.name || 'iAgent';
  sections.push(`あなたは${personaName}のバックグラウンドチェッカーです。`);

  if (ctx.persona.personality) {
    sections.push(`性格: ${ctx.persona.personality}`);
  }

  sections.push(`与えられたタスクに基づいて定期チェックを実行し、結果をJSON形式で返してください。

必ず以下のJSON形式で回答してください（他のテキストは含めないでください）:
{
  "results": [
    {
      "taskId": "タスクID",
      "hasChanges": true/false,
      "summary": "変化の要約（変化がない場合は空文字列）"
    }
  ]
}

現在の日時: ${ctx.currentDateTime}
ルール:
- hasChanges が false の場合、summary は空文字列にしてください
- 通知する価値がある情報のみ hasChanges: true にしてください
- 日本語で summary を書いてください
- ブリーフィングタスク（タスクIDが "briefing-" で始まるもの）は必ず hasChanges: true とし、複数のツールで収集した情報を統合した総合サマリーを summary に含めてください`);

  // メモリ
  const hbRegularMemories = ctx.memories.filter((m) => m.category !== 'reflection');
  const hbReflections = ctx.memories.filter((m) => m.category === 'reflection');
  if (hbRegularMemories.length > 0) {
    sections.push(`ユーザーについての記憶:\n${formatMemories(hbRegularMemories)}`);
  }
  if (hbReflections.length > 0) {
    sections.push(`振り返りからの洞察:\n${formatMemories(hbReflections)}`);
  }

  return sections.join('\n\n');
}

/** Worker Heartbeat 用システムプロンプトを構築する（heartbeatOpenAI.ts の buildSystemPrompt 代替） */
export function buildWorkerHeartbeatPrompt(ctx: InstructionContext): string {
  return buildHeartbeatInstructions(ctx);
}

/** ペルソナセクションを構築する */
function buildPersonaSection(persona: PersonaConfig): string {
  const personaName = persona.name || 'iAgent';
  const lines: string[] = [
    `あなたは${personaName}です。ブラウザ上で動作するパーソナルAIアシスタントです。`,
    'ユーザーの質問に答え、必要に応じてツールを使用してタスクを実行します。',
    'ツールの結果を受け取ったら、ユーザーにわかりやすく日本語で説明してください。',
    '日付や時刻に関する操作では、ユーザーのローカルタイムゾーンを考慮してください。',
  ];

  if (persona.personality) {
    lines.push(`\n性格・特徴: ${persona.personality}`);
  }
  if (persona.tone) {
    lines.push(`話し方: ${persona.tone}`);
  }
  if (persona.customInstructions) {
    lines.push(`\n### ユーザーからの追加指示\n${persona.customInstructions}`);
  }

  return lines.join('\n');
}

/** メモリ配列をフォーマットする */
function formatMemories(memories: Memory[]): string {
  return memories.map((m) => {
    const tags = m.tags && m.tags.length > 0 ? ` #${m.tags.join(' #')}` : '';
    const importance = m.importance && m.importance !== 3 ? ` (重要度:${m.importance})` : '';
    return `- [${m.category}] ${m.content}${importance}${tags}`;
  }).join('\n');
}
