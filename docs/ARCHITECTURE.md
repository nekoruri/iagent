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
| メイン (`iAgent`) | `gpt-5-mini` | チャット応答・ツール呼び出し（calendar, web_search, device_info, memory, clip, feed, web_monitor + MCP） |
| Heartbeat (`iAgent-Heartbeat`) | `gpt-5-nano` | バックグラウンドチェック（calendar, device_info + 許可済み MCP read-only ツール） |

- `src/core/agent.ts` の `createAgent()` / `createHeartbeatAgent()` で生成
- OpenAI Agents SDK (`@openai/agents`) の `Agent` クラスを利用
- 長期メモリ（memoryStore）から直近のメモリをコンテキストに注入
- `createHeartbeatAgent()` は `allowedMcpToolNames` パラメータで MCP ツールをフィルタリング可能
- `isReadOnlyTool()` ユーティリティで read-only ツール判定（`list_*`, `get_*`, `search_*`, `read_*`）

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
| `src/core/heartbeat.ts` | `HeartbeatEngine` — メインスレッド上の Heartbeat エンジン（Layer 1） |
| `src/core/heartbeatCommon.ts` | Layer 2/3 共通パイプライン（`executeHeartbeatAndStore`, `getTasksDueFromIDB`） |
| `src/core/heartbeatOpenAI.ts` | OpenAI Chat Completions API を使った Heartbeat タスク実行（fetch ベース、DOM 非依存） |
| `src/core/heartbeatTools.ts` | Heartbeat エージェント用ツール 20 種の定義・実行。純粋関数（`computeMonthlyGoalStats`, `computeUserActivityPatterns`, `computeSuggestionOptimizations`）+ 設定適用ヘルパー（`applyAction` — ミュータブル変更）+ ソース横断トピック統合ヘルパー + Action Planning（`applyHeartbeatConfigAction` による自動設定変更）。HTML パースに linkedom の DOMParser を使用（Worker 環境対応） |
| `src/core/heartbeatWorkerBridge.ts` | Dedicated Worker とのブリッジ（Layer 2） |
| `src/workers/heartbeat.worker.ts` | Dedicated Worker 本体（Layer 2） |
| `src/workers/heartbeatWorkerProtocol.ts` | Worker メッセージプロトコル定義 |
| `src/sw.ts` | カスタム Service Worker — Push/PeriodicSync ハンドラ（Layer 3） |
| `src/core/pushSubscription.ts` | Push Subscription 管理（登録/解除/Periodic Sync） |
| `src/core/notifier.ts` | Notification API ラッパー |
| `server/` | Cloudflare Workers wake-up cron サーバー |

### 実行モデル（3 層構成）

```
                        ┌──────────────────────────────────────────────────┐
  タブ表示中            │  Layer 1: メインスレッド HeartbeatEngine          │
  （フォアグラウンド）  │  60秒 tick → getTasksDue() → Agent API 実行     │
                        └──────────────────────────────────────────────────┘
                                      ↕ Visibility API 自動切替
                        ┌──────────────────────────────────────────────────┐
  タブ非表示            │  Layer 2: Dedicated Worker                       │
  （バックグラウンド）  │  60秒 tick → executeHeartbeatAndStore()          │
                        │  結果を postMessage でメインスレッドに通知       │
                        └──────────────────────────────────────────────────┘
                                      ↕ タブ閉鎖で Layer 2 停止
                        ┌──────────────────────────────────────────────────┐
  タブ閉鎖後            │  Layer 3: Service Worker + Web Push              │
  （プロセス外）        │  push / periodicsync イベント                    │
                        │  → executeHeartbeatAndStore()                    │
                        │  → showNotification()                            │
                        └──────────────────────────────────────────────────┘
                                      ↑
                        ┌──────────────────────────────────────────────────┐
  外部トリガー          │  Cloudflare Workers Cron (*/15 * * * *)          │
                        │  → KV から全 Subscription 取得                   │
                        │  → Web Push 送信 {type: "heartbeat-wake"}       │
                        └──────────────────────────────────────────────────┘
```

### Layer 1: メインスレッド (`HeartbeatEngine`)

- `src/core/heartbeat.ts` の `HeartbeatEngine` クラス
- `setInterval(60_000)` で毎分 tick → `getTasksDue()` でスケジュール評価
- OpenAI Agents SDK (`@openai/agents`) を使用して Agent を実行
- OTel 計装あり（`tracer.startTrace('heartbeat.check')`）
- Listener パターンでチャット UI に結果を通知

### Layer 2: Dedicated Worker

- `src/workers/heartbeat.worker.ts` が Worker 本体
- `src/core/heartbeatWorkerBridge.ts` がメインスレッドとの通信を管理
- **Visibility API 連動**: `useHeartbeat` フックが `document.hidden` を監視し、自動で Layer 1 ↔ 2 を切替
- Worker 内は DOM 非依存 — `heartbeatCommon.ts` の共通パイプラインを使用
- XML パースに `fast-xml-parser`、HTML パースに `linkedom` の DOMParser を使用（Worker 環境で DOMParser が未定義のため）
- DOMPurify のサニタイズは `linkedom` の window で初期化（ブラウザ環境ではネイティブ DOMPurify を使用）
- OpenAI Chat Completions API を `fetch()` で直接呼び出し（`heartbeatOpenAI.ts`）
- 結果は `postMessage` でメインスレッドに送信

### Layer 3: Service Worker + Web Push

**設計原則**: サーバーはユーザーデータを一切扱わない。Push は「今チェックして」というシグナルのみ。実際の Heartbeat ロジック（API 呼出、カレンダー確認等）は全て Service Worker 内で完結する。

#### Service Worker (`src/sw.ts`)

`vite-plugin-pwa` の `injectManifest` モードで、カスタム SW をビルド時に precache マニフェストと統合。

**イベントハンドラ**:

| イベント | トリガー | 処理 |
|---|---|---|
| `push` | サーバーからの Web Push | `executeHeartbeatAndStore()` → 変化あれば通知表示、なければサイレント通知+即閉 |
| `periodicsync` (tag: `heartbeat-periodic`) | ブラウザの定期実行 | 同上（通知はサイレントなし） |
| `notificationclick` | ユーザーが通知をクリック | 既存タブをフォーカス or 新規タブで `/` を開く |

**Chrome の push 通知制約**: push イベント受信時は必ず `showNotification()` を呼ぶ必要がある。変化なしの場合はサイレント通知を出して即閉じる。

#### Push Subscription 管理 (`src/core/pushSubscription.ts`)

| 関数 | 処理 |
|---|---|
| `subscribePush(serverUrl)` | VAPID 公開鍵取得 → `pushManager.subscribe()` → サーバーに登録 |
| `unsubscribePush(serverUrl)` | サーバーから削除 → `subscription.unsubscribe()` |
| `getPushSubscription()` | 現在の Subscription 状態を返す |
| `registerPeriodicSync(ms)` | Periodic Background Sync をフォールバック登録（Chrome/Edge のみ） |
| `unregisterPeriodicSync()` | Periodic Sync を解除 |

#### Web Push フロー

```
[クライアント]                          [サーバー (CF Workers)]
     │                                         │
     │  GET /vapid-public-key                   │
     │ ──────────────────────────────────────>   │
     │  ← { publicKey: "..." }                  │
     │                                         │
     │  pushManager.subscribe({                 │
     │    userVisibleOnly: true,                │
     │    applicationServerKey: <VAPID公開鍵>   │
     │  })                                     │
     │                                         │
     │  POST /subscribe                         │
     │  { subscription: { endpoint, keys } }    │
     │ ──────────────────────────────────────>   │
     │  → KV に保存（TTL: 30日）                │
     │  ← { ok: true }                          │
     │                                         │
     ╍╍╍╍╍ (タブ閉鎖) ╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍   │
     │                                         │
     │            [Cron: */15 * * * *]          │
     │                  ← KV から全 Sub 取得    │
     │                  ← VAPID JWT 署名        │
     │   push {type: "heartbeat-wake"}          │
     │ <─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
     │                                         │
  [SW起動]                                      │
     │  executeHeartbeatAndStore()              │
     │  → IndexedDB から設定・タスク読み込み    │
     │  → OpenAI API 呼び出し（SW 内で完結）    │
     │  → 結果を IndexedDB に保存              │
     │  → showNotification() で通知表示         │
```

#### Cloudflare Workers サーバー (`server/`)

```
server/
├── wrangler.toml.example  # 設定テンプレート（コピーして wrangler.toml を作成）
├── package.json
├── tsconfig.json
├── scripts/
│   └── generate-vapid.mjs  # VAPID キーペア生成
└── src/
    └── index.ts        # Routes + Cron handler + VAPID 署名 + Web Push 暗号化
```

**エンドポイント**:

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/vapid-public-key` | VAPID 公開鍵を返す |
| POST | `/subscribe` | Subscription を KV に保存（TTL: 30日） |
| POST | `/unsubscribe` | Subscription を KV から削除 |
| GET | `/health` | ヘルスチェック |
| POST | `/register` | CORS プロキシ用トークン発行（マスターキー認証） |
| POST | `/proxy` | CORS プロキシ（Bearer トークン認証） |
| (Cron) | — | 全 Subscription に `{type:"heartbeat-wake"}` push を送信 |

**セキュリティ設計**:
- KV には Subscription（endpoint + 暗号鍵）のみ保存。API キーやユーザーデータは一切扱わない
- VAPID 秘密鍵は `wrangler secret put` で管理（環境変数）
- Web Push ペイロードは aes128gcm で暗号化（Web Crypto API ベース）
- Subscription は 30 日の TTL で自動削除
- 404/410 レスポンスの Subscription は自動クリーンアップ

**CORS プロキシ セキュリティ設計**:

| 対策 | 実装 |
|------|------|
| 認証 | マスターキーで `/register` → トークン自動生成（TTL 90日）→ Bearer トークンで `/proxy` 認証 |
| SSRF 防止 | プライベート IP レンジ拒否（127/10/172.16/192.168/169.254）+ localhost 拒否 |
| HTTPS 強制 | `https:` プロトコルのみ許可 |
| リダイレクト検証 | `redirect: 'manual'` で手動追跡、各リダイレクト先も SSRF 検証、上限 5 回 |
| レート制限 | KV ベース、60 秒ウィンドウ / 30 リクエスト（`CF-Connecting-IP` ベース） |
| サイズ制限 | 2MB 上限、ストリーミング読み取りで超過時 abort |
| タイムアウト | 15 秒（`AbortController`） |
| ドメイン制御 | クライアント側の許可ドメインリスト（`ProxyConfig.allowedDomains`） |
| ログ | 全リクエストを `[Proxy]` プレフィックスで Workers ログに出力 |

クライアント側: `src/core/corsProxy.ts` の `fetchViaProxy()` でプロキシ経由のリソース取得。設定 UI で サーバーURL / トークン / 許可ドメインを管理。

**デプロイ手順**:
1. `cd server && npm install`
2. `cp wrangler.toml.example wrangler.toml` でテンプレートをコピー
3. `node scripts/generate-vapid.mjs` で VAPID キーペアを生成
4. `wrangler secret put VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
5. `wrangler kv namespace create SUBSCRIPTIONS` で KV 作成、`wrangler.toml` に ID を設定
6. `wrangler kv namespace create RATE_LIMIT` で KV 作成、`wrangler.toml` に ID を設定
7. `wrangler secret put PROXY_MASTER_KEY` でプロキシ用マスターキーを設定
8. `wrangler deploy`

### 排他制御（Layer 間の重複回避）

Layer 間の排他制御は **IndexedDB のタイムスタンプベースで自動的に解決**される。追加のロックは不要。

- `getTasksDueFromIDB()` が `lastChecked` / `taskLastRun` のタイムスタンプを評価
- Layer 3 が実行 → `taskLastRun` が更新 → タブ復帰時に Layer 1 が `getTasksDue()` を呼ぶと、タイムスタンプが新しいため skip
- Layer 2 と Layer 3 が同時実行された場合も、同じタイムスタンプベースの判定により二重実行を防止

### 共通パイプライン (`heartbeatCommon.ts`)

Layer 2 / Layer 3 で共有される Heartbeat 実行パイプライン。

| 関数 | 処理 |
|---|---|
| `loadFreshConfig(fallbackKey, fallbackConfig)` | IndexedDB から最新設定を読み込み。失敗時はフォールバック |
| `getTasksDueFromIDB(config)` | タスクスケジュール評価（global/interval/fixed-time） |
| `executeHeartbeatAndStore(apiKey)` | 設定読込 → タスク判定 → API 呼出 → 結果保存。`HeartbeatAndStoreResult` を返す（`results`: 変化ありの結果、`configChanged`: Action Planning による設定変更フラグ） |

### 動作ルール

- 設定間隔（デフォルト 30 分）で定期実行
- 深夜スキップ（デフォルト 0〜6 時）+ 曜日別スキップ
- エージェント実行中はスキップ
- フォーカスモード（手動 ON/OFF で通知一時停止）
- 日次通知上限
- タスクごとの個別スケジュール（global / interval / fixed-time）
- Action Planning — F16 分析結果に基づく自動設定変更（タスク有効/無効、quiet hours/days、チェック間隔）。`configChanged` フラグで Worker → メインスレッドに設定同期

### PWA ビルド設定

`vite-plugin-pwa` を `injectManifest` モードで使用:

```typescript
// vite.config.ts
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  // ...
})
```

- `src/sw.ts` がソース。ビルド時に `precacheAndRoute(self.__WB_MANIFEST)` のマニフェストが自動注入される
- `tsconfig.app.json` の `exclude` に `src/sw.ts` を追加（`tsc -b` は SW をスキップ）
- `tsconfig.sw.json` は IDE サポート用（`lib: ["ES2022", "WebWorker"]`）

---

## データ永続化

### IndexedDB (`iagent-db`, version 10)

| ストア | keyPath | 用途 |
|---|---|---|
| `conversations` | `id` | 会話メッセージ（`conversationId` インデックス付き） |
| `conversation-meta` | `id` | 会話メタデータ（`updatedAt` インデックス） |
| `calendar` | `id` | カレンダーイベント（`date` インデックス） |
| `heartbeat` | `key` | Heartbeat 状態・結果 |
| `memories` | `id` | エージェント長期メモリ（`category`, `updatedAt`, `importance`, `tags`(multiEntry), `contentHash`, `lastAccessedAt` インデックス） |
| `memories_archive` | `id` | アーカイブ済み記憶（品質ベースアーカイブで移動） |
| `traces` | `traceId` | テレメトリトレースデータ（`startTime`, `exported` インデックス） |
| `config` | `key` | アプリ設定 |
| `clips` | `id` | クリッピング（`createdAt`, `tags`(multiEntry) インデックス） |
| `feeds` | `id` | RSS フィード購読情報 |
| `feed-items` | `id` | フィード記事（`feedId`, `publishedAt`, `guid` インデックス） |
| `monitors` | `id` | Web ページ監視対象 |

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
