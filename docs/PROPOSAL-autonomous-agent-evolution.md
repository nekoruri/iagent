# PROPOSAL: 自律型エージェントの進化 — 長期記憶に基づく意思決定とプロアクティブ行動

> 調査日: 2026-02-27
> ステータス: 調査メモ。Phase E / F の主要項目は ROADMAP へ反映され一部実装済み、残りは中長期候補
> 関連: [ROADMAP.md](ROADMAP.md) フェーズ 2〜4

---

## 1. 調査の背景

iAgent は現在、チャットベースの **リアクティブなエージェント** として機能している。
ユーザーが質問 → エージェントが回答するループが基本で、Heartbeat による定期チェックが唯一の自律行動。

本調査では、エージェントの能力の幅を広げるために、以下の3軸で最新事例・研究を網羅的に調査した:

1. **自律型 AI エージェントのフレームワーク・商用プロダクト・アーキテクチャパターン**
2. **長期記憶に基づく自律的意思決定の研究**
3. **プロアクティブ行動（自発的行動）の事例と技術**

---

## 2. 主要な発見

### 2.1 記憶アーキテクチャの進化

認知科学に基づく **4 種類の記憶** が AI エージェントの標準分類として確立されている（CoALA, 2023; Memory Survey, 2025）:

| 記憶タイプ | 内容 | iAgent の現状 |
|---|---|---|
| **Working Memory** | 現在のタスクの短期コンテキスト | `instructionBuilder` が担当（部分的） |
| **Episodic Memory** | 過去の経験・やり取りの時系列記録 | 会話履歴として保存（構造化は不十分） |
| **Semantic Memory** | 知識・事実・ユーザー情報 | `memories` ストア（importance/tags/カテゴリ） |
| **Procedural Memory** | 学習したスキル・手順の再利用 | **未実装** |

**重要な研究:**

- **Generative Agents**（Stanford, 2023）: 記憶ストリーム + Reflection（定期的な振り返りで高次の洞察を生成） + Planning の 3 本柱。記憶検索は `recency × importance × relevance` のスコアリング
- **MemGPT / Letta**（2023→2025）: OS の仮想メモリに着想を得た 2 階層記憶管理。エージェント自身がコンテキストウィンドウの内容を管理する
- **Voyager**（2023）: Minecraft エージェント。学習したスキルを JavaScript 関数として保存する「スキルライブラリ」。破滅的忘却を回避
- **A-MEM**（NeurIPS 2025）: Zettelkasten 方式。各記憶をキーワード・タグ・リンク付きの「ノート」として構造化し、LLM が動的にリンクを構築
- **Mem0**（2025, $24M 調達）: プロダクション向け記憶レイヤー。抽出→更新の 2 フェーズ。OpenAI 対比で 26% 精度向上、91% レイテンシ削減
- **MemRL**（2026）: エピソード記憶上のランタイム強化学習。重み更新なしで経験から学習

### 2.2 ブラウザ内ベクトル検索の実用化

**WebANNS**（SIGIR 2025）により、ブラウザ内での近似最近傍検索が実用レベルに到達:
- IndexedDB + WASM で **10ms レンジ** のベクトル検索
- Lazy Loading で IndexedDB アクセスを 45% 高速化
- メモリ使用量 39% 削減

**主要ライブラリ:**
| ライブラリ | 特徴 |
|---|---|
| [EntityDB](https://github.com/babycommando/entity-db) | Transformers.js 統合、自動埋め込み生成 |
| [EdgeVec](https://github.com/matte1782/edgevec) | Rust/WASM、100K ベクトルでサブミリ秒 |
| [TinkerBird](https://github.com/wizenheimer/tinkerbird) | HNSW インデックス |

**Transformers.js** がクライアントサイド埋め込みのデファクト。`all-MiniLM-L6-v2`（22MB）で実用的な精度。WebGPU バックエンドで WASM 比 最大 100 倍高速化。

### 2.3 プロアクティブ行動の最前線

**商用事例:**
- **ChatGPT Pulse**（2025）: 毎晩バックグラウンドでユーザーデータを分析し、翌朝パーソナライズドサマリーを配信。thumbs up/down でフィードバックループ
- **Google CC**（2025）: Gmail/Calendar/Drive 統合の日次ブリーフィング
- **Notion AI Custom Agents**: スケジュール/トリガーで 24/7 自律動作

**学術研究:**
- **ProactiveBench**（ICLR 2025）: プロアクティブタスク予測のベンチマーク。F1=66.47%
- **CHI 2025**: プロアクティブ提案の頻度↑ → 生産性↑ だが **好感度は半減**。頻度制御が極めて重要

### 2.4 注目アーキテクチャパターン

| パターン | 概要 | iAgent との関連 |
|---|---|---|
| **Reflexion** | タスク後の自己反省を記憶に保存し次回に活用 | Heartbeat の結果振り返りに最適 |
| **Plan-and-Execute** | 計画と実行を分離。サブタスク分解→順次実行 | マルチステップタスクの正式化 |
| **Voyager スキルライブラリ** | 学習した手順をコードとして保存・再利用 | 手続き記憶の実装モデル |
| **ReAct + Reflect** | 行動+反省サイクルの統合（2025 年の主流） | メインエージェントの拡張 |

### 2.5 WebMCP — ゲームチェンジャー

Google + Microsoft による W3C 標準化（2026 年 2 月に Chrome 146 Canary でプレビュー）:
- **すべてのウェブサイトを AI エージェントの構造化ツールに変える**
- Declarative API（HTML フォームベース）+ Imperative API（JavaScript ベース）
- スクレイピング・スクリーンショット不要で、サイトの機能を直接利用可能
- iAgent のビジョンに最も直接的にインパクトのある技術

### 2.6 ハードウェアエージェントの教訓

Humane AI Pin（死亡）と Rabbit R1（95% ユーザー離脱）の失敗は、**専用ハードウェアではなくブラウザ上に構築する iAgent の判断が正しい** ことを裏付けている。

---

## 3. iAgent への具体的な進化提案

調査結果を統合し、iAgent の既存アーキテクチャ（Heartbeat 3 層構成、IndexedDB memories ストア、instructionBuilder、ペルソナ設定）を活かした段階的な進化を提案する。

### Phase E: 認知メモリアーキテクチャ

**目標**: エージェントの記憶を「保存するだけ」から「考え、学び、成長する」仕組みに進化させる。

#### E-1. Reflection（定期的な振り返り）— Generative Agents 方式

Heartbeat の定期実行を活用し、蓄積された記憶から高次の洞察を自動生成する。

```
[Heartbeat: 1日1回、深夜帯]
  → 直近の memories（24時間分）を取得
  → LLM に「これらの経験から何が言えるか？」を問い合わせ
  → 生成された洞察を category: 'reflection' で memories に保存
  → 高重要度の反省は次回のプロンプトに自動注入
```

**実装の影響範囲:**
- `memories` ストアに `reflection` カテゴリを追加
- Heartbeat に `reflection` ビルトインタスクを追加
- `instructionBuilder` で reflection 記憶を優先的にコンテキストに含める

**期待効果:** エージェントが「Aさんは朝に天気を聞くことが多い」「最近フィードの技術記事への関心が高まっている」のような高次理解を自律的に獲得。

#### E-2. 記憶の忘却とコンパクション

記憶数の増大に対する耐性を確保する。

- **時間減衰**: `lastAccessed` フィールドを追加。長期未アクセスの記憶のスコアを指数減衰
- **容量管理**: 記憶数が閾値（例: 1000 件）を超えたら、最低スコアの記憶を自動削除
- **要約統合**: 類似する複数の記憶を LLM で 1 つに統合（Mem0 の Update Phase 方式）
- **実行タイミング**: Heartbeat の深夜帯実行時にクリーンアップ

#### E-3. Procedural Memory（手続き記憶）— Voyager 方式

ユーザーの操作パターンやよく使うワークフローを「スキル」として記録・再利用する。

```typescript
// memories ストアに procedural カテゴリを追加
{
  category: 'procedural',
  content: '天気確認→カレンダー確認→ブリーフィング作成',
  tags: ['morning', 'routine'],
  importance: 4,
  metadata: {
    triggerPattern: 'morning-briefing',
    successRate: 0.9,
    usageCount: 15,
  }
}
```

**効果:** 「毎朝やっていること」をエージェントが学習し、自動的に再現可能に。

#### E-4. セマンティック検索の導入

現在のキーワードマッチングから埋め込みベースの類似度検索に段階的に移行。

- **段階 1**: Transformers.js で `all-MiniLM-L6-v2` を採用。記憶保存時に埋め込みを生成し IndexedDB に保存。ブルートフォースコサイン類似度検索（記憶数 < 1000 なら十分高速）
- **段階 2**: 記憶数が増加した場合、EdgeVec（Rust/WASM）で HNSW インデックスを導入
- **段階 3**: Transformers.js v4 の WebGPU バックエンドでモデル推論を高速化

**トレードオフ:** 埋め込みモデルの初回ダウンロード（22MB）とメモリ消費。オプトイン設定にすべき。

### Phase F: プロアクティブ提案エンジン

**目標**: エージェントがユーザーの指示なしに自発的に有用な情報を提供する。

#### F-1. 日次ブリーフィング — ChatGPT Pulse / Google CC 型

既存の Heartbeat fixed-time スケジュールに `morning-briefing` タスクを追加:

```
[Heartbeat fixed-time: 07:00]
  → カレンダー: 今日の予定
  → 天気: 今日の天気と気温変化
  → RSS フィード: 前日からの新着記事サマリー
  → Web 監視: 変更検出サマリー
  → memories: 今日に関連する記憶（reflection 含む）
  → LLM でブリーフィングテキスト生成
  → Push 通知 + HeartbeatPanel に表示
```

#### F-2. フィードバックループ

CHI 2025 の知見（頻度↑ → 好感度↓）を踏まえ、提案の質を継続的に改善する仕組み:

- Heartbeat 結果に対する **accept / dismiss** の UI を追加
- 提案タイプ別の採用率をトラッキング
- 採用率が低い提案タイプを自動抑制
- ユーザーが明示的に頻度を調整できる設定（即時/日次ダイジェスト/週次ダイジェスト）

#### F-3. コンテキスト認識型トリガー

時間ベース以外のトリガーで提案を生成:

- **イベント接近**: カレンダーの予定の 30 分前にリマインド + 関連情報
- **パターンベース**: 「毎週月曜朝に必ずカレンダーを確認する」→ 月曜朝に自動ブリーフィング
- **変化検出**: フィードや Web 監視で重要な変化を検出したとき即時通知

### Phase G: エージェントの学習ループ（Reflexion パターン）

**目標**: エージェントがタスクの成功/失敗から学び、次回の判断を改善する。

```
[タスク実行]
  → 結果の評価（成功 / 部分成功 / 失敗）
  → 自己反省テキストの生成
    「このタスクでは X がうまくいった。Y は改善の余地がある」
  → 反省をエピソード記憶として保存
  → 次回の類似タスクで反省を参照
```

**具体例:**
- Heartbeat の天気チェックで「昨日は雨の予報だったが実際は晴れた」→ 「天気予報の信頼度を報告に含めるべき」という反省を保存
- RSS フィードチェックで「ユーザーが技術記事だけ accept して芸能ニュースは dismiss した」→ フィルタリング基準をメモリに保存

---

## 4. 技術的なアーキテクチャ（提案）

```
┌─────────────────────────────────────────────────────────┐
│                    Memory Manager                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Episodic     │  │ Semantic     │  │ Procedural   │  │
│  │ Memory       │  │ Memory       │  │ Memory       │  │
│  │ (経験記録)   │  │ (知識・事実) │  │ (スキル)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └──────────┬──────┴──────────┬──────┘          │
│              ┌─────┴─────┐    ┌──────┴──────┐          │
│              │ Importance │    │ Semantic    │          │
│              │ Scoring    │    │ Search      │          │
│              │ + Decay    │    │ (optional)  │          │
│              └─────┬─────┘    └──────┬──────┘          │
│                    └──────┬─────────┘                   │
│                     ┌─────┴─────┐                       │
│                     │ Retrieval │ → Working Memory に注入│
│                     │ Engine    │                        │
│                     └─────┬─────┘                       │
│                     ┌─────┴─────┐                       │
│                     │ Compaction│ ← Heartbeat 定期実行  │
│                     │ & Reflect │                        │
│                     └───────────┘                       │
├─────────────────────────────────────────────────────────┤
│                 Proactive Engine                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Briefing │  │ Feedback │  │ Context-Aware        │  │
│  │ Generator│  │ Loop     │  │ Triggers             │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    IndexedDB                             │
│  memories | conversations | feeds | monitors | clips    │
│  + embeddings (optional)                                │
└─────────────────────────────────────────────────────────┘
```

---

## 5. 実装の優先度

| 優先度 | 機能 | 根拠 | 規模 |
|---|---|---|---|
| **P0** | Reflection（Heartbeat 連携） | 既存基盤の自然な拡張。最小コストで最大の価値 | 小 |
| **P0** | 記憶の忘却/コンパクション | 記憶数増大への耐性確保。運用上の必須要件 | 小 |
| **P0** | 日次ブリーフィング | Heartbeat fixed-time の拡張。最も分かりやすい自律行動 | 中 |
| **P1** | Procedural Memory | Voyager 方式のスキル学習。能力の累積的向上 | 中 |
| **P1** | フィードバックループ | 提案品質の継続改善。CHI 2025 の知見を反映 | 中 |
| **P1** | Reflexion（タスク学習） | 成功/失敗からの学習。長期的な判断精度向上 | 中 |
| **P2** | セマンティック検索 | 埋め込みベースの類似度検索。記憶の質的向上 | 大 |
| **P2** | コンテキスト認識型トリガー | 時間以外のトリガー。より自然な提案タイミング | 中 |
| **P3** | WebMCP 統合 | Chrome 146+ での対応準備。2026 年後半 | 大 |
| **P3** | WebLLM オンデバイス推論 | API 依存脱却。完全クライアントサイド化 | 大 |

---

## 6. 注目すべき外部動向

| 動向 | 時期 | iAgent への影響 |
|---|---|---|
| **WebMCP** W3C 標準化 | 2026 年中盤〜後半 | 全ウェブサイトがツール化。能力が劇的に拡大 |
| **Transformers.js v4** WebGPU | 2025 年〜 | クライアントサイド埋め込み生成が実用的に |
| **Chrome window.ai API** | 実験中 | ブラウザ組み込みモデルへのアクセス |
| **Declarative Web Push** | Chrome 実装待ち | サーバー不要のプッシュ通知 |
| **MCP W3C 標準化** | 進行中 | 非同期操作、ステートレス性などの新機能 |

---

## 7. 参考文献（主要なもの）

### 記憶アーキテクチャ
- [Generative Agents](https://arxiv.org/abs/2304.03442) — Stanford, 2023
- [MemGPT / Letta](https://arxiv.org/abs/2310.08560) — 2023
- [Voyager](https://arxiv.org/abs/2305.16291) — 2023
- [CoALA](https://arxiv.org/abs/2309.02427) — 2023
- [A-MEM](https://arxiv.org/abs/2502.12110) — NeurIPS 2025
- [Mem0](https://arxiv.org/abs/2504.19413) — 2025
- [Episodic Memory is the Missing Piece](https://arxiv.org/abs/2502.06975) — 2025
- [Memory in the Age of AI Agents](https://arxiv.org/abs/2512.13564) — 2025
- [MemRL](https://arxiv.org/abs/2601.03192) — 2026

### 自律的意思決定
- [Reflexion](https://arxiv.org/abs/2303.11366) — NeurIPS 2023
- [Self-Refine](https://arxiv.org/abs/2303.17651) — 2023
- [LATS](https://arxiv.org/abs/2310.04406) — 2023

### プロアクティブ行動
- [Proactive Agent](https://arxiv.org/abs/2410.12361) — ICLR 2025
- [CHI 2025: Designing Proactive AI Assistants](https://dl.acm.org/doi/10.1145/3706598.3714002)
- [ChatGPT Pulse](https://openai.com/index/introducing-chatgpt-pulse/)
- [Google CC](https://blog.google/technology/google-labs/cc-ai-agent/)

### ブラウザ技術
- [WebANNS](https://dl.acm.org/doi/10.1145/3726302.3730115) — SIGIR 2025
- [WebMCP](https://developer.chrome.com/blog/webmcp-epp) — Chrome 146 Preview
- [WebLLM](https://github.com/mlc-ai/web-llm)
- [Transformers.js](https://github.com/xenova/transformers.js/)
- [Mozilla 3W Architecture](https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/)

### フレームワーク・プロダクト
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Project Mariner](https://deepmind.google/models/project-mariner/)
- [Browser Use](https://github.com/browser-use/browser-use)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)

### 記憶サービス実装
- [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) — MCP ベースの永続的セマンティックメモリバックエンド

---

## 付録 A: mcp-memory-service の分析

> [doobidoo/mcp-memory-service](https://github.com/doobidoo/mcp-memory-service)

### 概要

AI エージェント向けの永続的セマンティックメモリバックエンド。Python 実装。
SQLite-vec + ONNX Runtime (`all-MiniLM-L6-v2`) でベクトル検索を実現し、
「夢にインスパイアされた記憶統合（Dream-Inspired Consolidation）」パイプラインが最大の特徴。

### Dream-Inspired Consolidation — 5 段階パイプライン

人間の睡眠中の記憶定着プロセスをモデル化:

1. **指数減衰スコアリング**: `relevance = importance × exp(-age/retention) × connection_boost × access_boost × quality_multiplier`。カテゴリ別保持期間（decision=365日, error=30日, temporary=7日）
2. **創造的アソシエーション発見**: コサイン類似度 **0.3〜0.7** の「スイートスポット」にフォーカスし、意外で有用な関連を発見
3. **セマンティッククラスタリング**: DBSCAN で記憶をクラスタ化
4. **セマンティック圧縮**: クラスタ内の記憶群をテーマ要約に圧縮し `pattern` タイプで再格納
5. **制御された忘却**: 品質スコアに連動した保持期間。削除ではなくアーカイブ（復元可能）

### iAgent 適用時の注目ポイント

| 機能 | ブラウザ実現可能性 | 実装方法 |
|---|---|---|
| 指数減衰スコアリング | 完全に可能 | `Math.exp(-age/retention)` |
| 暗黙的シグナル追跡 | 完全に可能 | `accessCount`/`lastAccessedAt` を IndexedDB で管理 |
| コンテンツハッシュ重複排除 | 完全に可能 | `crypto.subtle.digest('SHA-256', ...)` |
| 品質ベース忘却 + アーカイブ | 可能 | IndexedDB 別ストアへの移動 |
| ベクトル検索 | 可能 | Transformers.js + JS コサイン類似度 |
| DBSCAN クラスタリング | 困難 | コサイン類似度閾値の簡易クラスタリングで代替 |
| 関係グラフ | 可能（100件規模） | IndexedDB + JS BFS/DFS |
| 名前空間付きタグ | 完全に可能 | `q:high`, `proj:xxx` のプレフィックス文字列 |
| 保護メモリ | 完全に可能 | `protected` フラグまたはカテゴリ判定 |

### Phase E への反映

mcp-memory-service の知見を踏まえ、Phase E（認知メモリアーキテクチャ）の実装順序を以下に更新:

1. **E-0: 記憶モデル拡張** — `accessCount`, `lastAccessedAt`, `contentHash` フィールド追加 + 重複排除
2. **E-1: 指数減衰スコアリング** — カテゴリ別保持期間による連続的な関連性スコア
3. **E-2: 記憶の忘却 + アーカイブ** — 品質ベースの保持ポリシー + アーカイブストア
4. **E-3: Reflection** — Heartbeat 連携の定期振り返り
5. **E-4: セマンティック検索** — Transformers.js + IndexedDB ベクトル検索（オプトイン）
6. **E-5: 簡易コンソリデーション** — 類似記憶のクラスタ化→LLM 要約圧縮
