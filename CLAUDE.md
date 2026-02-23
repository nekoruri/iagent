# CLAUDE.md

このファイルは AI エージェント（Claude Code 等）がリポジトリを理解するためのガイドです。

## !! プロジェクトの目的 !!

**このプロジェクトは、スマートフォンや PC 上でクライアントサイドの OpenClaw のような自律型 AI エージェントの実現を可能にするための PoC（Proof of Concept）です。**
サーバーに依存せず、ブラウザ上でエージェントが自律的にツールを呼び出し、バックグラウンドで動作し、ユーザーの日常タスクを支援する世界観を検証しています。

## プロジェクト概要

iAgent — ブラウザ上で動作するパーソナル AI アシスタント（PWA）。
OpenAI Agents SDK でチャット・ツール呼び出し・バックグラウンドチェックを実装。

## 技術スタック

- React 19 + TypeScript + Vite 7
- OpenAI Agents SDK (`@openai/agents`)
- Model Context Protocol SDK (`@modelcontextprotocol/sdk`)
- IndexedDB (`idb`) — 会話・カレンダー・Heartbeat の永続化
- localStorage — 設定・API キー
- Vitest + jsdom — テスト
- vite-plugin-pwa — PWA / Service Worker

## コーディング規約

- インデント: 2 スペース
- セミコロン: あり
- クォート: シングルクォート優先
- UI テキスト・コメント: 日本語
- 識別子・コード: 英語

## ディレクトリ構成

```
src/
├── components/   UI コンポーネント（ChatView, InputBar, MessageBubble, SettingsModal, ToolIndicator）
├── core/         ビジネスロジック（agent, config, heartbeat, mcpClient, mcpManager）
├── hooks/        React カスタムフック（useAgentChat, useHeartbeat）
├── store/        IndexedDB ストア（db, conversationStore, calendarStore, heartbeatStore）
├── tools/        エージェント用ツール定義（calendar, webSearch, deviceInfo）
└── types/        型定義
```

## コマンド

```bash
npm run dev            # 開発サーバー起動
npm run build          # tsc + vite build
npm test               # vitest run（1 回実行）
npm run test:watch     # vitest（監視モード）
npm run test:coverage  # vitest --coverage
npm run lint           # eslint
```

## テスト

- フレームワーク: Vitest（jsdom 環境）
- カバレッジ対象: `src/core/**`, `src/store/**`
- IndexedDB モック: `src/store/__mocks__/db.ts`（メモリベース）
- テストファイル: `*.test.ts`（対象モジュールと同階層）

## アーキテクチャ

### レイヤー構成

1. **コンポーネント層** — UI 表示とイベントハンドリング
2. **フック層** — 状態管理とライフサイクル（useAgentChat, useHeartbeat）
3. **コア層** — Agent 定義、MCP 接続管理、Heartbeat エンジン、設定管理
4. **ストア層** — IndexedDB による永続化

### Agent

- メインエージェント: `gpt-5-mini`（チャット応答）
- Heartbeat エージェント: `gpt-5-nano`（バックグラウンドチェック）
- `src/core/agent.ts` で `createAgent()` / `createHeartbeatAgent()` を定義

### MCP 連携

- ブラウザ向け StreamableHTTP クライアント（`mcpClient.ts`）
- サーバー接続管理（`mcpManager.ts`）で複数 MCP サーバーの接続・切断を制御
- MCP ツールは Agent の `mcpServers` パラメータ経由で統合

### Heartbeat

- `src/core/heartbeat.ts` の `HeartbeatEngine` クラス
- 1 分ごとにティックし、設定間隔で Heartbeat エージェントを実行
- 深夜スキップ・エージェント実行中スキップ・Visibility API 連携
- 結果は IndexedDB に最大 50 件保存

### データ永続化

- **IndexedDB** (`iagent-db`): conversations, calendarEvents, heartbeat-state の 3 ストア
- **localStorage** (`iagent-config`): API キー、MCP サーバー設定、Heartbeat 設定

## Vite 設定の注意点

- `/api/brave` → `https://api.search.brave.com` へのプロキシ（開発サーバー）
- `/api/weather` → `https://api.openweathermap.org` へのプロキシ（開発サーバー）

## CI

GitHub Actions（`.github/workflows/ci.yml`）: main ブランチの push / PR で `npm test` → `npm run build`（Node.js 22）。

## ロードマップ

`docs/ROADMAP.md` に長期計画・タスクアイデア・完了済み項目を記録している。機能追加や設計変更を行った際は、このファイルを必ず更新すること（完了チェック、新規タスク追加など）。
