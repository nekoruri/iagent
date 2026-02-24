# アーキテクチャ

iAgent のアーキテクチャ詳細。全体像は [README.md](../README.md) を参照。

---

## レイヤー構成

```
コンポーネント層   UI 表示とイベントハンドリング
      ↓
フック層           状態管理とライフサイクル（useAgentChat, useHeartbeat, useConversations, useHeartbeatPanel）
      ↓
コア層             Agent 定義、MCP 接続管理、Heartbeat エンジン、設定管理、通知
      ↓
ストア層           IndexedDB / localStorage による永続化
```

---

## Agent

| Agent | モデル | 用途 |
|---|---|---|
| メイン (`iAgent`) | `gpt-5-mini` | チャット応答・ツール呼び出し |
| Heartbeat (`iAgent-Heartbeat`) | `gpt-5-nano` | バックグラウンドチェック |

- `src/core/agent.ts` の `createAgent()` / `createHeartbeatAgent()` で生成
- OpenAI Agents SDK (`@openai/agents`) の `Agent` クラスを利用
- 長期メモリ（memoryStore）から直近のメモリをコンテキストに注入

---

## MCP 連携

- **クライアント**: ブラウザ向け StreamableHTTP 実装（`src/core/mcpClient.ts`）
- **接続管理**: `src/core/mcpManager.ts` で複数 MCP サーバーの接続・切断を制御
- MCP ツールは Agent の `mcpServers` パラメータ経由で統合

---

## Heartbeat

バックグラウンドで定期的にエージェントを実行し、ユーザーに通知する仕組み。

### コンポーネント

| ファイル | 役割 |
|---|---|
| `src/core/heartbeat.ts` | `HeartbeatEngine` — メインスレッド上の Heartbeat エンジン |
| `src/core/heartbeatOpenAI.ts` | OpenAI API を使った Heartbeat タスク実行 |
| `src/core/heartbeatTools.ts` | Heartbeat エージェント用ツール定義 |
| `src/core/heartbeatWorkerBridge.ts` | Dedicated Worker とのブリッジ |
| `src/workers/heartbeat.worker.ts` | Dedicated Worker 本体 |
| `src/workers/heartbeatWorkerProtocol.ts` | Worker メッセージプロトコル定義 |
| `src/core/notifier.ts` | Notification API ラッパー |

### 実行モデル（2 層構成）

1. **メインスレッド**: `HeartbeatEngine` が 1 分ごとにティックし、設定間隔で Heartbeat エージェントを実行
2. **Dedicated Worker**: タブ非表示時に `HeartbeatWorkerBridge` 経由で Worker に切り替え、Visibility API で自動制御

### 動作ルール

- 設定間隔（デフォルト 30 分）で定期実行
- 深夜スキップ（デフォルト 0〜6 時）
- エージェント実行中はスキップ
- タスクごとの個別スケジュール（global / interval / fixed-time）

---

## データ永続化

### IndexedDB (`iagent-db`, version 7)

| ストア | keyPath | 用途 |
|---|---|---|
| `conversations` | `id` | 会話メッセージ（`conversationId` インデックス付き） |
| `conversation-meta` | `id` | 会話メタデータ（`updatedAt` インデックス） |
| `calendar` | `id` | カレンダーイベント（`date` インデックス） |
| `heartbeat` | `key` | Heartbeat 状態・結果 |
| `memories` | `id` | エージェント長期メモリ（`category`, `updatedAt` インデックス） |
| `traces` | `traceId` | テレメトリトレースデータ（`startTime`, `exported` インデックス） |
| `config` | `key` | アプリ設定 |

### localStorage (`iagent-config`)

- API キー（OpenAI, Brave Search, OpenWeatherMap）
- MCP サーバー設定
- Heartbeat 設定
- OTel 設定

---

## テレメトリ

OTel (OpenTelemetry) 互換の軽量トレーサーを自前実装（バンドルサイズ増を回避）。

| ファイル | 役割 |
|---|---|
| `src/telemetry/tracer.ts` | トレース・スパン生成 |
| `src/telemetry/span.ts` | スパン実装 |
| `src/telemetry/exporter.ts` | OTLP/HTTP JSON エクスポーター |
| `src/telemetry/store.ts` | IndexedDB トレースストア（上限 200 件） |
| `src/telemetry/config.ts` | OTel 設定読み取り |
| `src/telemetry/ids.ts` | トレース ID / スパン ID 生成 |
| `src/telemetry/semantics.ts` | セマンティック属性定義 |
| `src/telemetry/types.ts` | 型定義 |

### 計装対象

- **useAgentChat**: チャット実行トレース、ツールスパン、usage 取得
- **Heartbeat**: タスク実行トレース

### 設定

- 有効/無効、OTLP エンドポイント、認証ヘッダー
- デフォルトエンドポイント: `/api/otel`（開発サーバーで `localhost:4318` にプロキシ）
