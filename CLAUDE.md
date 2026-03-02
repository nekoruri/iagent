# CLAUDE.md

このファイルは AI エージェント（Claude Code 等）がリポジトリで作業する際に守るべき **方針と規約** を定義する。
リファレンス情報は各ドキュメントを参照すること。

---

## !! プロジェクトの目的 !!

**このプロジェクトは、スマートフォンや PC 上でクライアントサイドの OpenClaw のような自律型 AI エージェントの実現を可能にするための PoC（Proof of Concept）です。**
サーバーに依存せず、ブラウザ上でエージェントが自律的にツールを呼び出し、バックグラウンドで動作し、ユーザーの日常タスクを支援する世界観を検証しています。

---

## コーディング規約

- インデント: 2 スペース
- セミコロン: あり
- クォート: シングルクォート優先
- UI テキスト・コメント: 日本語
- 識別子・コード: 英語

---

## 開発方針

- テストファイルは `*.test.ts` で対象モジュールと同階層に配置する
- 機能追加や設計変更を行った際は `docs/ROADMAP.md` を必ず更新すること（完了チェック、新規タスク追加など）
- セッション中に新機能の提案や設計議論が行われた場合、`docs/PROPOSAL-*.md` にまとめてからセッションを終了すること（コンテキストクリア後も方針を引き継げるようにする）
- `docs/PROPOSAL-*.md` のコミットは、次に対応する PR に必ず含めること（単独 PR にしない）

---

## 手動テスト手順

機能追加・変更後は以下の手順で手動テストを実施すること。

### 1. 静的チェック
```bash
npx tsc --noEmit          # TypeScript 型チェック
npx vitest run            # 全ユニットテスト
```

### 2. UI 確認（Playwright MCP または手動ブラウザ）
```bash
npx vite                  # 開発サーバー起動
```
- アプリが正常に起動し、初期画面が表示されること
- 設定画面（⚙）を開き、変更箇所に関連する UI が正しく表示されること
  - Heartbeat ビルトインタスク: 名前・説明文・チェックボックス初期状態
  - 新規設定項目: デフォルト値・バリデーション
- ブラウザのコンソールにエラーが出ていないこと

### 3. 初回セットアップウィザードのスキップ（Playwright MCP 利用時）
API キー未設定だとウィザードが表示されるため、以下で回避する:
```js
localStorage.setItem('iagent-config', JSON.stringify({
  openaiApiKey: 'sk-test-dummy',
  heartbeat: { enabled: false, intervalMinutes: 30, quietHoursStart: 0, quietHoursEnd: 6, quietDays: [], maxNotificationsPerDay: 0, tasks: [], desktopNotification: false, focusMode: false }
}));
```
設定後にページを再読み込みすること。

---

## ドキュメント参照先

| ドキュメント | 内容 |
|---|---|
| [README.md](README.md) | プロジェクト概要、技術スタック、ディレクトリ構成、コマンド、テスト、CI |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | アーキテクチャ詳細（レイヤー構成、Agent、MCP、Heartbeat、データ永続化、テレメトリ） |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 長期計画・タスクアイデア・完了済み項目 |
| [docs/PROPOSAL-*.md](docs/) | 機能提案・設計議論の記録（セッション横断の文脈保持用） |
