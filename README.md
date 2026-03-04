# iAgent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

ブラウザ上で動作するパーソナルAIアシスタント。OpenAI Agents SDK を活用し、リアルタイムストリーミング、バックグラウンドチェック（Heartbeat）、MCP サーバー連携をサポートする PWA アプリケーション。

利用手順は [利用ガイド](docs/USER-GUIDE.md)、Push/Proxy サーバー運用は [運用ガイド](docs/OPERATIONS.md) を参照してください。

## 技術スタック

- **フロントエンド**: React 19 + TypeScript
- **ビルド**: Vite 7
- **AI**: OpenAI Agents SDK (`gpt-5-mini` / `gpt-5-nano`)
- **プロトコル**: Model Context Protocol (MCP)
- **永続化**: IndexedDB (`idb`) + localStorage
- **XML パース**: fast-xml-parser（Worker 環境対応）
- **Worker DOM**: linkedom（DOMParser / DOMPurify の Worker 環境対応）
- **テスト**: Vitest + jsdom
- **PWA**: vite-plugin-pwa (Workbox)

## 主要機能

### チャット
- OpenAI Agents SDK によるリアルタイムストリーミング応答
- Markdown レンダリング（marked + DOMPurify）
- 会話履歴の複数管理（サイドバーから作成・切替・削除）
- ストリーム停止ボタン

### ビルトインツール
- **カレンダー** — 予定の作成・検索・リマインダー（IndexedDB ベース）
- **Web 検索** — Brave Search API 経由（上位 5 件）
- **デバイス情報** — バッテリー残量、位置情報、天気
- **メモリ** — ユーザー情報の長期記憶（save / search / list / delete）
- **クリップ** — Web 情報の構造化保存・検索
- **フィード** — RSS/Atom 購読と記事取得
- **Web ページ監視** — 指定ページの差分検知

### MCP サーバー連携
- 任意の MCP サーバー URL を設定画面から登録
- ブラウザベースの StreamableHTTP クライアント実装
- 接続状態のリアルタイム表示

### Heartbeat（バックグラウンドチェック）
- 設定間隔（デフォルト 30 分）で定期実行
- ビルトインタスク 11 種: カレンダーチェック、天気チェック、フィードチェック（3段階分類）、Webページ監視、ふりかえり、情報整理チェック、週次サマリー、月次レビュー、パターン認識、提案品質の最適化、朝のブリーフィング
- カスタムタスクの定義が可能（個別スケジュール設定: global/interval/fixed-time）
- Dedicated Worker によるバックグラウンド実行（Visibility API 連動）
- Service Worker + Web Push（タブ閉鎖後も動作）
- 結果の専用パネル（ベルアイコン + 未読バッジ + フィードバック UI）
- 深夜スキップ・曜日別スキップ・日次通知上限・フォーカスモード
- デスクトップ通知（Notification API）
- フィードバック学習ループ（Accept/Dismiss/Snooze → 分析 → 最適化ルール → instructions 注入 → 自動設定変更）

### テレメトリ
- OTel 互換の軽量トレーサー（チャット・Heartbeat を計装）
- IndexedDB にトレースをローカル保存
- OTLP/HTTP JSON エクスポーター（外部バックエンドへの送信）

### PWA
- インストール可能なウェブアプリ
- Service Worker による自動キャッシュ

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで設定画面（⚙）を開き、以下の API キーを入力:

| キー | 必須 | 用途 |
|------|------|------|
| OpenAI API Key | ✅ | チャット・Heartbeat |
| Brave Search API Key | — | Web 検索ツール |
| OpenWeatherMap API Key | — | 天気ツール |

詳細な画面操作・設定は [利用ガイド](docs/USER-GUIDE.md) を参照。

## スクリプト

```bash
npm run dev            # 開発サーバー（HMR）
npm run build          # 本番ビルド（tsc + vite build）
npm test               # テスト実行（vitest run）
npm run test:watch     # テスト監視モード
npm run test:coverage  # カバレッジ測定（vitest --coverage）
npm run lint           # ESLint
npm run preview        # ビルド結果プレビュー
npm run poc:init-week -- --week 2026-W11  # PoC週次ドキュメント雛形を一括生成
npm run poc:sync-validation -- --week 2026-W11  # インタビュー結果を週次レビューへ反映
npm run poc:run-week -- --week 2026-W11 --user-data-dir /tmp/iagent-metrics-profile  # 週次一括実行
npm run poc:run-week -- --week 2026-W11 --user-data-dir /tmp/iagent-metrics-profile --strict  # Action判定で非0終了
```

## プロジェクト構成

```
src/
├── components/        # React コンポーネント
│   ├── ChatView.tsx              チャット画面
│   ├── ConversationSidebar.tsx   会話一覧サイドバー
│   ├── HeartbeatPanel.tsx        Heartbeat 結果パネル
│   ├── InputBar.tsx              入力バー
│   ├── MessageBubble.tsx         メッセージ表示（Markdown）
│   ├── SettingsModal.tsx         設定モーダル
│   ├── TaskProgress.tsx          マルチステップタスク進捗表示
│   └── ToolIndicator.tsx         ツール実行状態表示
├── core/              # ビジネスロジック
│   ├── agent.ts                  Agent 定義（メイン & Heartbeat）
│   ├── config.ts                 設定管理（localStorage）
│   ├── heartbeat.ts              Heartbeat エンジン
│   ├── heartbeatOpenAI.ts        Heartbeat OpenAI 実行
│   ├── heartbeatTools.ts         Heartbeat ツール定義
│   ├── heartbeatWorkerBridge.ts  Worker ブリッジ
│   ├── mcpClient.ts              MCP クライアント
│   ├── mcpManager.ts             MCP 接続管理
│   └── notifier.ts               通知（Notification API）
├── hooks/             # カスタムフック
│   ├── useAgentChat.ts           チャット送受信 & ストリーミング
│   ├── useConversations.ts       会話管理（CRUD）
│   ├── useHeartbeat.ts           Heartbeat ライフサイクル
│   └── useHeartbeatPanel.ts      Heartbeat パネル状態
├── store/             # IndexedDB / localStorage ストア
│   ├── db.ts                     DB 初期化（iagent-db, v11）
│   ├── calendarStore.ts          カレンダーイベント
│   ├── configStore.ts            設定（IndexedDB）
│   ├── conversationMetaStore.ts  会話メタデータ
│   ├── conversationStore.ts      会話メッセージ
│   ├── heartbeatStore.ts         Heartbeat 結果
│   └── memoryStore.ts            エージェント長期メモリ
├── telemetry/         # テレメトリ（OTel 互換トレーサー）
│   ├── config.ts                 OTel 設定読み取り
│   ├── exporter.ts               OTLP/HTTP エクスポーター
│   ├── ids.ts                    ID 生成
│   ├── semantics.ts              セマンティック属性
│   ├── span.ts                   スパン実装
│   ├── store.ts                  トレースストア（IndexedDB）
│   ├── tracer.ts                 トレーサー
│   └── types.ts                  型定義
├── tools/             # エージェント用ツール
│   ├── calendarTool.ts
│   ├── clipTool.ts
│   ├── deviceInfoTool.ts
│   ├── feedTool.ts
│   ├── memoryTool.ts
│   ├── webMonitorTool.ts
│   └── webSearchTool.ts
├── types/
│   └── index.ts
└── workers/           # Web Workers
    ├── heartbeat.worker.ts         Heartbeat Dedicated Worker
    └── heartbeatWorkerProtocol.ts  Worker メッセージプロトコル
```

## テスト

- **フレームワーク**: Vitest（jsdom 環境）
- **カバレッジ対象**: `src/core/**`, `src/store/**`, `src/tools/**`, `src/hooks/**`
- **IndexedDB モック**: `src/store/__mocks__/db.ts`（メモリベースの fake-indexeddb）
- **テストファイル**: `*.test.ts`（対象モジュールと同階層に配置）

## 開発サーバー プロキシ設定

Vite 開発サーバーで以下のプロキシが設定されている（`vite.config.ts`）:

| パス | 転送先 | 用途 |
|---|---|---|
| `/api/brave` | `https://api.search.brave.com` | Brave Search API |
| `/api/weather` | `https://api.openweathermap.org` | OpenWeatherMap API |
| `/api/otel` | `http://localhost:4318` | OTLP エクスポーター |

## テスト用 MCP サーバー

`test-mcp-server/` に開発・テスト用の MCP サーバーを同梱。

```bash
cd test-mcp-server
npm install
npm start              # localhost:3001 で起動
```

echo / get_time / roll_dice の 3 ツールを提供。

## CI

GitHub Actions（`.github/workflows/ci.yml`）で main ブランチへの push / PR 時にテストとビルドを自動実行（Node.js 22）。

## ドキュメント

- [利用ガイド](docs/USER-GUIDE.md)
- [運用ガイド（Push/Proxy サーバー）](docs/OPERATIONS.md)
- [アーキテクチャ詳細](docs/ARCHITECTURE.md)
- [ロードマップ](docs/ROADMAP.md)
- [PoC KPI 定義](docs/POC-KPI.md)
- [PoC ユーザー検証ループ](docs/POC-USER-VALIDATION.md)
- [PoC SLO 運用ガイド](docs/POC-SLO.md)
- [PoC 指標の収集手順](docs/POC-METRICS-COLLECTION.md)
- [PoC 週次レビュー（W10）](docs/weekly/2026-W10.md)

### PoC 指標収集

```bash
npm run metrics:poc
```

`iagent-db`（IndexedDB）から PoC KPI（Accept率 / 7日アクティブ率 / 通知再訪率）と 24h SLO を収集する。
継続観測では `--user-data-dir` 指定で同一プロファイルを使う。

## ライセンス

[MIT License](LICENSE) の下で公開されています。
