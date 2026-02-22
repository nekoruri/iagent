# iAgent

ブラウザ上で動作するパーソナルAIアシスタント。OpenAI Agents SDK を活用し、リアルタイムストリーミング、バックグラウンドチェック（Heartbeat）、MCP サーバー連携をサポートする PWA アプリケーション。

## 技術スタック

- **フロントエンド**: React 19 + TypeScript
- **ビルド**: Vite 7
- **AI**: OpenAI Agents SDK (`gpt-5-mini` / `gpt-5-nano`)
- **プロトコル**: Model Context Protocol (MCP)
- **永続化**: IndexedDB (`idb`)
- **テスト**: Vitest + jsdom
- **PWA**: vite-plugin-pwa (Workbox)

## 主要機能

### チャット
- OpenAI Agents SDK によるリアルタイムストリーミング応答
- Markdown レンダリング（marked + DOMPurify）
- IndexedDB による会話履歴の永続化
- ストリーム停止ボタン

### ビルトインツール
- **カレンダー** — 予定の作成・検索・リマインダー（IndexedDB ベース）
- **Web 検索** — Brave Search API 経由（上位 5 件）
- **デバイス情報** — バッテリー残量、位置情報、天気

### MCP サーバー連携
- 任意の MCP サーバー URL を設定画面から登録
- ブラウザベースの StreamableHTTP クライアント実装
- 接続状態のリアルタイム表示

### Heartbeat（バックグラウンドチェック）
- 設定間隔（デフォルト 30 分）で定期実行
- ビルトインタスク: カレンダーチェック、天気チェック
- カスタムタスクの定義が可能
- 深夜スキップ機能（デフォルト 0〜6 時）
- 差分検知（変化なしは通知しない）

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

## スクリプト

```bash
npm run dev            # 開発サーバー（HMR）
npm run build          # 本番ビルド
npm test               # テスト実行
npm run test:watch     # テスト監視モード
npm run test:coverage  # カバレッジ測定
npm run lint           # ESLint
npm run preview        # ビルド結果プレビュー
```

## プロジェクト構成

```
src/
├── components/        # React コンポーネント
│   ├── ChatView.tsx         チャット画面
│   ├── InputBar.tsx         入力バー
│   ├── MessageBubble.tsx    メッセージ表示（Markdown）
│   ├── SettingsModal.tsx    設定モーダル
│   └── ToolIndicator.tsx    ツール実行状態表示
├── core/              # ビジネスロジック
│   ├── agent.ts             Agent 定義（メイン & Heartbeat）
│   ├── config.ts            設定管理（localStorage）
│   ├── heartbeat.ts         Heartbeat エンジン
│   ├── mcpClient.ts         MCP クライアント
│   └── mcpManager.ts        MCP 接続管理
├── hooks/             # カスタムフック
│   ├── useAgentChat.ts      チャット送受信 & ストリーミング
│   └── useHeartbeat.ts      Heartbeat ライフサイクル
├── store/             # IndexedDB ストア
│   ├── db.ts                DB 初期化
│   ├── conversationStore.ts 会話履歴
│   ├── calendarStore.ts     カレンダーイベント
│   └── heartbeatStore.ts    Heartbeat 結果
├── tools/             # エージェント用ツール
│   ├── calendarTool.ts
│   ├── webSearchTool.ts
│   └── deviceInfoTool.ts
└── types/
    └── index.ts
```

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
