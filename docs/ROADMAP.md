# iAgent ロードマップ

## ビジョン

スマートフォンや PC 上で、サーバーに依存せずブラウザ上でエージェントが自律的に動作し、ユーザーの日常タスクを支援する世界観を実現する。

---

## 現状（2026-02-25 時点）

- チャット UI（ストリーミング対応）
- ビルトインツール 3 種（カレンダー、Web 検索、デバイス情報）
- MCP サーバー連携（ブラウザベース StreamableHTTP）
- Heartbeat バックグラウンドチェック
- デスクトップ通知（Notification API）
- PWA（カスタム Service Worker + injectManifest、インストール可能）
- エージェント長期メモリ（memoryTool + 自動コンテキスト注入）
- マルチステップタスク実行 + TaskProgress 進捗UI
- カスタムワークフロー（タスクごとの個別スケジュール設定）
- オブザーバビリティ基盤（OTel 互換トレーサー + OTLP/HTTP エクスポーター）
- 会話履歴の複数管理（サイドバー + 作成・切替・削除）
- Heartbeat 3層構成（メインスレッド + Dedicated Worker + Service Worker/Push）
- テスト 263 件（Statements 86.45%+）

---

## フェーズ 1: 基盤強化

### Heartbeat バックグラウンド実行（3層構成）
- [x] 層2: Dedicated Worker — タブ非表示時に Worker で Heartbeat 実行 + Visibility API 切り替え
- [x] 層3: Push API + Cloudflare Workers — タブ完全閉鎖後もサーバー経由で定期チェック
- [x] vite-plugin-pwa を `injectManifest` モードに切替
- [x] カスタム Service Worker に Heartbeat ロジックを移行
- [x] Periodic Background Sync API で定期チェック（フォールバック）
- [x] Service Worker 内からの `showNotification()` に移行
- [x] Cloudflare Workers wake-up cron サーバー（`server/` ディレクトリ）
- [x] Push Subscription 管理 UI（設定モーダル）
- **意義**: タブを閉じてもエージェントが動き続ける＝自律型の核心体験

### オブザーバビリティ基盤
- [x] OTel 互換の軽量トレーサー自前実装（バンドルサイズ増を回避）
- [x] IndexedDB にトレースデータをローカル永続化（traces ストア、上限200件）
- [x] OTLP/HTTP JSON エクスポーター（外部バックエンドへのバッチ送信）
- [x] useAgentChat 計装（チャット実行トレース、ツールスパン、usage 取得）
- [x] Heartbeat 計装（タスク実行トレース）
- [x] 設定 UI（有効/無効、OTLP エンドポイント、認証ヘッダー）

### テスト基盤の拡充

#### ユニットテスト完備（Statements 70% 目標 → 達成済み 86.45%）
- [x] `calendarStore.ts` のテスト追加（7.69% → 100%）
- [x] `mcpClient.ts` のテスト追加（0% → 98.76%）
- [x] `mcpManager.ts` のテスト追加（0% → 98.82%）
- [x] `heartbeat.ts` のカバレッジ改善（51.53% → 96.31%）
- [x] CI にカバレッジ閾値（Statements 70%）を設定

#### コンポーネント / フックテスト導入
- [x] @testing-library/react + @testing-library/user-event 導入
- [x] InputBar テスト（入力 → 送信、空文字無効化、ストリーミング中ブロック）
- [x] SettingsModal テスト（API キー入力保存、MCP サーバー追加削除）
- [x] ConversationSidebar テスト（一覧表示、選択、削除）
- [x] useConversations フックテスト（CRUD、マイグレーション）
- [x] useHeartbeat フックテスト（エンジン連携、visibility 連動）

#### E2E テスト導入
- [x] Playwright 導入 + page.route() で OpenAI API モック
- [x] 初回起動 → API キー設定 → チャット送信フロー
- [x] 会話管理（作成・切替・削除）フロー
- [x] モバイルビューポートでのドロワー動作
- [x] CI に E2E テストステップ追加（main PR 時のみ）

#### テスト品質の継続改善
- [x] telemetry をカバレッジ対象に追加
- [ ] ツール定義（calendarTool 等）のインテグレーションテスト
- [ ] Visual Regression テスト（Playwright スクリーンショット比較）

---

## フェーズ 2: エージェント体験の深化

### 会話履歴の複数管理
- [x] 会話一覧 UI（サイドバー / モバイルドロワー）
- [x] 会話の作成・切替・削除
- [x] IndexedDB conversations ストアの拡張（conversation-meta ストア、conversationId インデックス）
- [x] 既存メッセージの自動マイグレーション

### エージェントの長期メモリ
- [x] IndexedDB に memory ストア追加
- [x] `memoryTool.ts`（save / search / list / delete）
- [x] ユーザーの好みや過去のやり取りを蓄積
- [x] Heartbeat タスクのパーソナライズに活用

### マルチステップタスク実行
- [x] エージェント instructions にタスク分解戦略を追加
- [x] ツール呼び出し引数・結果のキャプチャ
- [x] TaskProgress コンポーネント（ステップ進捗の階層表示）

### Heartbeat 高度化
- [x] 結果の専用パネル（チャットとの分離）
- [x] タスクごとの個別間隔設定（カスタムワークフロー: global/interval/fixed-time スケジュール）
- [ ] 条件付き実行（位置情報ベース、時間帯ベース等）

### Web Push 信頼性向上
- [x] `pushsubscriptionchange` ハンドラ — Subscription 失効時の自動再登録
- [x] Heartbeat API 呼び出しの fetch タイムアウト（90秒）
- [ ] Periodic Background Sync の実際の最小間隔（12時間）に関するドキュメント・UI 説明追加
- [ ] iOS PWA インストール導線 — Safari は PWA インストール後のみ Push 対応、設定画面にガイド追加
- [ ] Chrome 通知パーミッション自動取り消し対策 — 低エンゲージメントサイトで通知権限が自動取り消しされる問題への対応（定期的な権限チェック）
- [ ] Declarative Web Push 対応検討 — Chrome 実装後のサーバーレス Push 通知（サーバー不要化の可能性）

---

## フェーズ 3: UX 改善

### UI
- [ ] 初回セットアップウィザード（API キー入力の導線改善）
- [ ] ライト/ダークテーマ切替
- [ ] レスポンシブ改善（モバイル最適化）

### ビルド最適化
- [ ] バンドルサイズ削減 — `dynamic import()` によるコード分割、`manualChunks` でベンダーチャンク分離（現在 index.js が 920KB 超で 500KB 警告）

### オフライン対応
- [ ] Service Worker キャッシュ戦略の改善
- [ ] オフライン時のフォールバック UI

---

## アイデア・検討中

- エージェント間の連携（複数エージェントの協調動作）
- プラグインシステム（ユーザーがカスタムツールを追加）
- ファイル添付・画像認識（マルチモーダル対応）
- 音声入出力（Web Speech API）
- 他ユーザーとのエージェント共有

---

## 完了済み

- [x] Heartbeat バックグラウンドチェック（2026-02-23）
- [x] デスクトップ通知 Notification API 統合（2026-02-23, PR #1）
- [x] エージェント長期メモリ — memoryTool + IndexedDB memories ストア + 自動コンテキスト注入（2026-02-23, PR #2）
- [x] マルチステップタスク実行 + TaskProgress 進捗UI（2026-02-24）
- [x] カスタムワークフロー — タスクごとの個別スケジュール（global/interval/fixed-time）（2026-02-24）
- [x] オブザーバビリティ基盤 — OTel 互換トレーサー + IndexedDB 永続化 + OTLP/HTTP エクスポーター（2026-02-25）
- [x] 会話履歴の複数管理 — サイドバー UI + 作成・切替・削除 + 既存データマイグレーション（2026-02-25）
- [x] テスト基盤拡充 — calendarStore/mcpClient/mcpManager/heartbeat テスト追加、Statements 53.4% → 86.45%（2026-02-25）
- [x] Heartbeat 層2（Dedicated Worker）— タブ非表示時の Worker 実行 + Visibility API 自動切り替え + IndexedDB 設定二重書き込み（2026-02-25）
- [x] Heartbeat 結果の専用パネル — ベルアイコン + 未読バッジ + ドロップダウン表示（2026-02-25）
- [x] ドキュメント分離 — CLAUDE.md スリム化 + README.md 最新化 + docs/ARCHITECTURE.md 新規作成（2026-02-25, PR #8）
- [x] テスト基盤フェーズ2 — カバレッジ閾値 70% 設定 + telemetry カバレッジ対象追加 + コンポーネント/フックテスト導入（206 → 240 テスト）（2026-02-25）
- [x] Heartbeat 層3（Service Worker + Web Push）— injectManifest 切替 + カスタム SW + Push/PeriodicSync ハンドラ + Cloudflare Workers サーバー + 3層統合（240 → 263 テスト）（2026-02-25）
- [x] E2E テスト導入 — Playwright + OpenAI SSE モック + 設定フロー/会話管理/モバイルドロワー/Push設定 UI テスト（16テスト）+ CI E2E ジョブ（2026-02-25）
