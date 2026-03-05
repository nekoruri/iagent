# iAgent ロードマップ

## ビジョン

スマートフォンや PC 上で、サーバーに依存せずブラウザ上でエージェントが自律的に動作し、ユーザーの日常タスクを支援する世界観を実現する。

---

## 現状（2026-03-04 時点）

- チャット UI（ストリーミング対応）
- ビルトインツール 7 種（カレンダー、Web 検索、デバイス情報、メモリ、クリッピング、RSS フィード、Web ページ監視）
- MCP サーバー連携（ブラウザベース StreamableHTTP）+ Heartbeat 対応（read-only ツール許可）
- Heartbeat バックグラウンドチェック（11 ビルトインタスク + カスタムタスク + Action Planning 自動設定変更）
- デスクトップ通知（Notification API）
- PWA（カスタム Service Worker + injectManifest、インストール可能）
- エージェント長期メモリ（構造化記憶 — importance/tags/カテゴリ拡張 + 関連性ベース取得 + 認知的記憶アーキテクチャ）
- エージェントペルソナ設定（名前・性格・口調・追加指示のカスタマイズ + 動的 instruction 構築）
- マルチステップタスク実行 + TaskProgress 進捗UI
- カスタムワークフロー（タスクごとの個別スケジュール設定）
- オブザーバビリティ基盤（OTel 互換トレーサー + OTLP/HTTP エクスポーター）
- 会話履歴の複数管理（サイドバー + 作成・切替・削除）
- Heartbeat 3層構成（メインスレッド + Dedicated Worker + Service Worker/Push）
- フィードバック学習ループ（Accept/Dismiss/Snooze → 集計 → パターン認識 → 最適化ルール → 自動設定変更）
- CORS プロキシ（Cloudflare Workers 拡張 — トークン認証 + SSRF 防止（IPv6 対応）+ レート制限）
- セキュリティ基盤（CSP ヘッダー + URL HTTPS 強制バリデーション + プロンプトインジェクション対策）
- ファイル添付・画像認識（マルチモーダル対応 — 画像/PDF/テキスト + クリップボードペースト + モバイルカメラ + IndexedDB 永続化）
- テスト 1154 件（クライアント）+ 31 件（サーバー）、E2E 27 テスト（desktop-chromium + mobile-chromium）、VRT 27 テスト / 54 スクリーンショット（vrt-desktop + vrt-mobile）
- レビューコメント全件トラッカー（docs/REVIEW-TRACKER.md）

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

#### Push 通知統合テスト（E2E）
- [x] OpenAI API URL を環境変数化（`VITE_OPENAI_API_URL`）で SW 内 fetch 先を差し替え可能に
- [x] OpenAI モック HTTP サーバー（`e2e/fixtures/openai-mock-server.ts`）
- [x] Push テスト専用 Playwright 設定（`playwright.push.config.ts`、`serviceWorkers: 'allow'`）
- [x] Push 受信 → SW Heartbeat 実行 → 完了の統合テスト（`e2e/push-integration.spec.ts`）

#### テスト品質の継続改善
- [x] telemetry をカバレッジ対象に追加
- [x] sw.ts ロジック抽出（swHandlers.ts）+ ユニットテスト
- [x] heartbeat.worker.ts ユニットテスト
- [x] ツール定義ユニットテスト（calendarTool, memoryTool, webSearchTool, deviceInfoTool, heartbeatFeedTools）
- [x] useAgentChat / useHeartbeatPanel フックのユニットテスト
- [x] カバレッジ対象に tools/** と hooks/** を追加
- [x] チャットストリーミング E2E テスト（4テスト: 基本ストリーミング、連続送信、Markdown レンダリング、送信ボタン状態）
- [x] ツール実行 UI の E2E テスト（2テスト: calendar ツール呼び出し、web_search ツール呼び出し）
- [x] Heartbeat パネル操作 E2E テスト（5テスト: ベル開閉、空メッセージ、結果一覧、未読バッジ、既読マーク）
- [x] Push E2E テストの CI 統合（`e2e-push` ジョブを PR 時に並列実行）
- [x] Visual Regression テスト（Playwright toHaveScreenshot() — 7 spec / 54 スクリーンショット、desktop + mobile、dark/light 両テーマ）

### セキュリティ基盤
- [x] MCP URL バリデーション（HTTPS 強制 + localhost 例外）— 共有ユーティリティ化 + コア層/UI 層の 2 層バリデーション
- [x] CSP ヘッダー導入 — 本番ビルド時のみ meta タグ注入（Vite プラグイン）
- [x] プロンプトインジェクション対策 — メモリ注入セクションにガード文追加（instructions/heartbeat 両方）
- [x] SSRF 防止 IPv6 対応 — isPrivateIP に IPv6 ループバック/ULA/リンクローカル/IPv4-mapped（16進表記含む）判定追加
- [x] MCP ツールアクセス制限ガード文強化
- [x] クライアント側 SSRF 防止 — `isPrivateIP()` を `server/src/proxy.ts` から `src/core/urlValidation.ts` に移植、`validateUrl()` でプライベート IP ブロック（多層防御）
- [x] MCP ツール許可キー server-qualified 化 — `allowedMcpTools` を `"serverName/toolName"` 形式に変更 + callable `toolFilter` でサーバー単位フィルタリング
- [x] MCP ツール許可タスク単位制御 — `groupTasksByMcpTools` でタスクをツールセット別にグループ化、グループごとに Agent を個別実行

### PoC 運用基盤（価値検証）
- [x] KPI 定義（North Star + 週次 3 指標）— `docs/POC-KPI.md`
- [x] ユーザー検証ループ定義（週次インタビュー運用）— `docs/POC-USER-VALIDATION.md`
- [x] SLO 運用定義（Heartbeat / Push の 3 SLI）— `docs/POC-SLO.md`
- [x] 週次レビュー / インタビューテンプレート整備 — `docs/templates/WEEKLY-REVIEW.md`, `docs/templates/USER-INTERVIEW-NOTE.md`
- [x] KPI 収集手順整備（DevTools Console スニペット）— `docs/POC-METRICS-COLLECTION.md`
- [x] 初回週次レビュー作成（W10）— `docs/weekly/2026-W10.md`
- [x] W10 baseline/インタビュー実体ファイル作成 — `docs/weekly/2026-W10-baseline.md`, `docs/weekly/interviews/*`
- [x] KPI/SLO 自動収集 CLI 追加（Playwright）— `npm run metrics:poc`, `scripts/collect-poc-metrics.mjs`
- [x] 週次雛形自動生成 CLI 追加 — `npm run poc:init-week`, `scripts/init-poc-week.mjs`
- [x] インタビュー→週次レビュー反映 CLI 追加 — `npm run poc:sync-validation`, `scripts/sync-poc-validation.mjs`
- [x] 週次一括実行 CLI 追加（init + metrics + validation）— `npm run poc:run-week`, `scripts/run-poc-week.mjs`
- [x] 週次レビュー記入漏れチェック CLI 追加 — `npm run poc:check-week`, `scripts/check-poc-week.mjs`

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
- [x] 構造化記憶 — importance(1-5)/tags/カテゴリ拡張（routine, goal, personality 追加）
- [x] 関連性ベースの記憶取得（スコアリング: キーワード一致 + importance + カテゴリボーナス + 時間近接性）
- [x] 後方互換 normalizeMemory（既存データのフォールバック）

### マルチステップタスク実行
- [x] エージェント instructions にタスク分解戦略を追加
- [x] ツール呼び出し引数・結果のキャプチャ
- [x] TaskProgress コンポーネント（ステップ進捗の階層表示）

### Heartbeat 高度化
- [x] 結果の専用パネル（チャットとの分離）
- [x] タスクごとの個別間隔設定（カスタムワークフロー: global/interval/fixed-time スケジュール）
- [ ] 条件付き実行（位置情報ベース、時間帯ベース等）
- [x] 重要な通知のピン留め／保護（ブリーフィング等が recentResults の FIFO で押し出されない仕組み）

### Web Push 信頼性向上
- [x] `pushsubscriptionchange` ハンドラ — Subscription 失効時の自動再登録
- [x] Heartbeat API 呼び出しの fetch タイムアウト（90秒）
- [ ] Periodic Background Sync の実際の最小間隔（12時間）に関するドキュメント・UI 説明追加
- [ ] iOS PWA インストール導線 — Safari は PWA インストール後のみ Push 対応、設定画面にガイド追加（→ フェーズ 3 スマートフォン対応強化に統合）
- [x] Chrome 通知パーミッション自動取り消し対策 — 低エンゲージメントサイトで通知権限が自動取り消しされる問題への対応（定期的な権限チェック）
- [ ] Declarative Web Push 対応検討 — Chrome 実装後のサーバーレス Push 通知（サーバー不要化の可能性）

---

## フェーズ 3: UX 改善

> 詳細: [docs/PROPOSAL-mobile-enhancement.md](PROPOSAL-mobile-enhancement.md)

### UI
- [x] 初回セットアップウィザード（API キー入力の導線改善）
- [x] ライト/ダークテーマ切替
- [x] FeedPanel（RSS 記事ブラウズ用ドロップダウン — tier フィルタ + 既読化 + 未読バッジ + Heartbeat 連動更新）

### スマートフォン対応強化
- [x] iOS キーボード対応（`dvh` + VisualViewport API）— 入力バーがキーボードに隠れる問題の修正
- [x] iOS PWA インストール案内 UI — Push 通知に必須のインストールへの導線
- [x] タップターゲットサイズの統一（44x44px 最小保証）
- [x] SettingsModal のモバイル最適化（フルスクリーン化 + セクション折りたたみ）
- [ ] サイドバーのスワイプジェスチャ（左端スワイプで開閉）
- [x] ストレージ永続化（`navigator.storage.persist()` + 容量表示）

### ビルド最適化
- [x] バンドルサイズ削減 — `manualChunks` でベンダーチャンク分離 + `isReadOnlyTool` 依存切断 + `React.lazy()` で SettingsModal 遅延ロード（950KB → 全チャンク 500KB 未満）

### マルチモーダル対応
- [x] ファイル添付 UI（クリップアイコン + ファイル選択 + プレビュー + 削除）
- [x] クリップボードペースト（Ctrl+V で画像貼り付け）
- [x] モバイルカメラ撮影（capture 属性）
- [x] 画像認識（OpenAI Agents SDK UserContent[] / input_image 型）
- [x] 任意ファイル対応（PDF/テキスト等、input_file 型）
- [x] IndexedDB 永続化（attachments ストア、DB_VERSION 11）
- [x] メッセージ表示の添付対応（サムネイル + フルサイズ表示）
- [x] 会話削除時の添付データクリーンアップ
- [ ] data URI → Blob 保存への移行（メモリ最適化）
- [ ] N+1 クエリ解消（`getAttachmentsByMessageIds()` バッチ関数）
- [ ] Web Worker でサムネイル生成（メインスレッドブロック回避）

### 音声入出力
- [x] Web Speech API による音声入力（STT）— SpeechRecognition + interimResults + マイクボタン UI
- [x] Web Speech API による音声読み上げ（TTS）— SpeechSynthesis + Markdown 除去 + メッセージバブル読み上げボタン
- [x] TTS 自動読み上げ（ストリーミング完了後に最新 AI 応答を自動読み上げ）
- [x] 設定 UI（STT/TTS 有効切替、言語選択、読み上げ速度スライダー）

### オフライン対応
- [x] オフラインフォールバック UI（オンライン状態検知 + バナー表示 + 送信無効化）
- [x] Service Worker キャッシュ戦略の改善

---

## フェーズ 4: 外部情報収集・自律行動の強化

> 詳細: [docs/PROPOSAL-external-integration.md](PROPOSAL-external-integration.md)

### ビルトインツール拡充
- [x] クリッピングツール（構造化保存 — DOMPurify sanitize + 500 件上限 + 100KB サイズ制限）
- [x] RSS/フィード収集ツール（購読管理 + RSS 2.0/Atom 1.0 パーサー + Heartbeat 定期チェック）
- [x] Web ページ監視ツール（CSS セレクタ指定 + SHA-256 差分検出 + Heartbeat 連携）

### MCP エコシステム活用
- [x] MCP ツールの Heartbeat 対応（read-only ツール許可リスト + 設定 UI）
- [ ] MCP プリセット UI（Notion, GitHub 等の人気サーバーをワンクリック追加）
- [x] MCP ツールフィルタリング — SDK ネイティブ `toolFilter` によるツール単位アクセス制御（instruction + SDK の二重防御）

### エージェントアイデンティティ + 記憶フレームワーク（Phase D）
- [x] Memory Enhancement — 構造化記憶（importance/tags/新カテゴリ）+ 関連性ベース取得 + 後方互換
- [x] Agent Persona — PersonaConfig 型 + getDefaultPersonaConfig + 設定 UI（名前・性格・口調・追加指示）
- [x] Instruction Builder — buildMainInstructions/buildHeartbeatInstructions/buildWorkerHeartbeatPrompt（全 7 ツールガイド + メモリ管理ガイドライン + プロアクティブ行動）
- [x] Integration — agent.ts/heartbeatOpenAI.ts/heartbeatCommon.ts に persona + instructionBuilder 統合
- [x] DB_VERSION 8→9（memories ストアに importance/tags インデックス追加）
- [ ] ペルソナプリセット配布 + インポート機能

### 認知的記憶アーキテクチャ（Phase E）
- [x] 指数減衰スコアリング — カテゴリ別半減期（personality:1年 〜 other:2週間）+ アクセス頻度ブースト
- [x] コンテンツハッシュ重複排除 — SHA-256 ハッシュで同一内容の記憶を統合（importance 最大値採用 + tags マージ）
- [x] 品質ベースアーカイブ — FIFO 削除を廃止、最低スコア記憶を memories_archive に移動（personality/routine は保護）
- [x] Memory モデル拡張 — accessCount/lastAccessedAt/contentHash フィールド追加 + ArchivedMemory 型
- [x] DB_VERSION 9→10（contentHash/lastAccessedAt インデックス + memories_archive ストア）
- [x] ふりかえりタスク — reflection ビルトインタスク（23:00 固定スケジュール）+ Worker ツール 3 種（getRecentMemoriesForReflection/saveReflection/cleanupMemories）
- [x] reflection カテゴリ — MemoryCategory に追加 + instructionBuilder で「振り返りからの洞察」分離表示
- [x] ふりかえり UI — reflection 記憶の閲覧・管理画面（MemoryPanel コンポーネント）
- [x] アーカイブ閲覧 UI — memories_archive の参照・復元機能

### エージェント自律性強化
- [x] 日次ブリーフィング — briefing-morning ビルトインタスク（07:00 固定スケジュール）+ Heartbeat プロンプトにブリーフィングルール追加
- [x] ブリーフィング高度化 — goal/context メモリ参照（`getMemoriesForBriefing` 拡張取得）+ instructionBuilder にメモリ4グループ分離表示（目標・締切/現在の状況/記憶/振り返り）+ ブリーフィングルール強化（目標参照・残り日数計算）
- [x] 期日接近検出 — goal メモリの日本語日付パース（deadlineParser）+ 残り日数の事前計算注入（formatGoalsWithDeadlines）+ Main/Heartbeat 両方の goal セクション対応
- [x] 学習継続ナッジ + 無活動検出 — goal メモリの `updatedAt` から活動状態を検出（7日ナッジ/14日警告/3日猶予）、`formatGoalsWithDeadlines` に活動状態ラベル + `#stale` タグ注入、ブリーフィングルールにナッジ・見直し提案指示追加
- [x] 多段階 RSS フィルタリング F5+ — FeedItem に tier/classifiedAt フィールド追加、feedStore 分類 API（listUnclassifiedItems/listClassifiedItems/updateItemTier）、Worker ツール 3 種（listUnreadFeedItems/saveFeedClassification/listClassifiedFeedItems）、feed-check タスク description を分類手順付きに変更、briefing-morning に listClassifiedFeedItems 参照追記、MAX_TOOL_ROUNDS 3→5
- [x] フィードバック UI F1 — HeartbeatResult に feedback フィールド追加、heartbeatStore に setHeartbeatFeedback/filterVisibleResults 追加、HeartbeatPanel にフィードバックボタン行（Accept/Dismiss/Snooze）+ SnoozeButton サブコンポーネント追加
- [x] 会話内コンテキストサジェスト F8 — チャット送信時に memory + clip + feed を横断検索し、関連情報を instructions に注入（getRelevantClips/getRelevantFeedItems キーワードスコアリング + tier ボーナス + 新しさボーナス）
- [x] カレンダーリマインド拡張 F6 — calendar-check タスクに searchMemoriesByQuery Worker ツール追加、予定の関連メモリを付加して通知
- [x] フィードバック集計 + Reflection 連携 F2 — FeedbackSummary 型 + getHeartbeatFeedbackSummary 集計関数 + Worker ツール、reflection タスクにフィードバック分析手順追加（学習ループ完成）
- [x] 閾値トリガー F13 — info-cleanup-check ビルトインタスク（20:00 固定スケジュール）+ getInfoThresholdStatus Worker ツール（未分類フィード/未読分類済み/クリップの閾値超過判定）
- [x] 週次サマリー F10 — weekly-summary ビルトインタスク（21:00 固定スケジュール、LLM 月曜判定）+ getWeeklyReflections Worker ツール（期間内 reflection 取得）+ フィードバック統計連携
- [x] ソース横断トピック統合 F17 — getCrossSourceTopics Worker ツール（RSS + クリップ横断検索 + URL/タイトル類似度による Union-Find グルーピング + sourceCount≥2 フィルタ）、briefing-morning description にトピック統合手順追加
- [x] フォーカスモード F4 — 手動 ON/OFF で Heartbeat 通知を一時停止（3層全て: メインスレッド/Worker/SW の tick 抑制 + ヘッダーベルアイコントグル）
- [x] 頻度制御エンジン F3 — 曜日別スキップ（quietDays）+ 日次通知上限（maxNotificationsPerDay）+ チャットサジェスト頻度（suggestionFrequency: high/medium/low）で通知疲れを防止
- [x] 月次レビュータスク F15 — monthly-review ビルトインタスク（08:00 固定スケジュール、LLM 月初判定）+ getMonthlyGoalStats Worker ツール（goal メモリの活動状態・期日状態を集計: active/new/stale/overdue 分類 + deadline 残り日数）+ computeMonthlyGoalStats 純粋関数（テスト容易性確保）+ 結果ピン留め
- [x] パターン認識トリガー F14 — pattern-recognition ビルトインタスク（22:00 固定スケジュール）+ getUserActivityPatterns Worker ツール（時間帯別 Accept 率・曜日別アクティビティ・タスク別トレンド・タグ頻出度変化を集計）+ computeUserActivityPatterns 純粋関数（テスト容易性確保）+ reflection 保存で briefing/他タスクが自動参照
- [x] 提案品質の自動最適化 F16 — suggestion-optimization ビルトインタスク（23:30 固定スケジュール）+ getSuggestionOptimizations Worker ツール（フィードバック統計 + 行動パターンからタスク別調整方針・タイミング最適化・カテゴリ重み調整を算出）+ computeSuggestionOptimizations 純粋関数（テスト容易性確保）+ instructionBuilder に最適化ルール専用セクション注入（suggestion-optimization タグ付き reflection を分離、最新1件を「活用すること」指示付きで挿入）+ 結果ピン留め
- [ ] 情報収集ワークフロー拡張（RSS ダイジェスト等の追加 Heartbeat タスク）
- [ ] プロアクティブ提案エンジン（関連情報サジェスト）
- [x] Action Planning（チェック → 判断 → アクション）

### レビュー環境整備
- [x] Copilot レビュー指示ファイル（`.github/copilot-instructions.md` + path-scoped `security.instructions.md`）
- [x] セキュリティスキャン CI（CodeQL + Semgrep、SARIF 統合）
- [x] Codex CLI レビュー自動化（`openai/codex-action@v1` + PR コメント投稿）
- [x] Copilot レビュー完了チェック（カスタム status check、Critical 指摘のみブロック）
- [x] Claude Code レビュースキル（`/review`, `/security-review`, `/test-review` + 4 並列サブエージェント）
- [ ] GitHub Rulesets 設定（Copilot 自動レビュー + Review new pushes）— UI から手動設定
- [ ] Required status checks 追加（copilot-review, codeql, semgrep）— UI から手動設定
- [ ] `OPENAI_API_KEY` シークレット追加 — GitHub Settings から手動設定

### 横断的課題
- [x] CORS プロキシ（Cloudflare Workers 拡張 — トークン認証 + SSRF 防止 + レート制限）

---

## アイデア・検討中

- エージェント間の連携（複数エージェントの協調動作）
- プラグインシステム（ユーザーがカスタムツールを追加）
- ~~ファイル添付・画像認識（マルチモーダル対応）~~ → フェーズ 3 UX 改善に移動
- ~~音声入出力（Web Speech API）~~ → フェーズ 3 UX 改善に移動・実装済み
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
- [x] Push 通知統合テスト — API URL 環境変数化 + OpenAI モックサーバー + SW 有効 Playwright 設定 + Push→Heartbeat E2E テスト（2026-02-26）
- [x] セキュリティ基盤整備 — MCP URL HTTPS 強制バリデーション + CSP meta タグ（本番ビルド）（2026-02-26）
- [x] CORS プロキシ — Cloudflare Workers 拡張（トークン認証 + SSRF 防止 + レート制限 + クライアント設定 UI）（2026-02-26）
- [x] 外部情報収集ツール Phase C — クリッピング（clipTool + clipStore）、RSS フィード（feedTool + feedParser + feedStore + Heartbeat 連携）、Web ページ監視（webMonitorTool + monitorStore + Heartbeat 連携）、MCP Heartbeat 対応（read-only ツール許可 + 設定 UI）。DB_VERSION 7→8、4 新ストア追加。テスト 263→369 件。（2026-02-26）
- [x] アイデンティティ + 記憶フレームワーク Phase D — 構造化記憶（importance/tags/新カテゴリ + 関連性ベース取得 + normalizeMemory 後方互換）、Agent Persona（PersonaConfig + 設定 UI + 動的 instructionBuilder）、全コンポーネント統合（agent.ts/heartbeatOpenAI.ts/heartbeatCommon.ts）。DB_VERSION 8→9。テスト 369→422 件。（2026-02-26）
- [x] 日次ブリーフィング Phase F-1 — briefing-morning ビルトインタスク（07:00 固定スケジュール）+ Heartbeat プロンプトにブリーフィングルール追加。テスト 448→450 件。（2026-02-27）
- [x] 通知ピン留め + ふりかえり UI — HeartbeatResult pinned フィールド + FIFO 保護 + togglePin + 自動ピン付与（briefing-*/reflection）+ HeartbeatPanel ピン UI + MemoryPanel（記憶管理パネル: カテゴリフィルタ・削除）+ listArchivedMemories。テスト 450→468 件。（2026-02-27）
- [x] セキュリティ + クリティカルバグ修正 PR-A — プロンプトインジェクション対策（メモリガード文）、SSRF IPv6 対応、MCP ツール制限強化、Worker エラー時リトライ暴走防止、Push 再登録エラーハンドリング、MCPServer 接続エラー個別ハンドリング、fetchFeeds 上限ガード追加、Heartbeat スケジュール飢餓修正（taskLastRun 個別追跡）、固定時刻見逃し防止、package.json private フラグ追加。（2026-02-27）
- [x] PR#23 レビュー対応 + パフォーマンス改善 PR-B — SSRF IPv4-mapped IPv6 16進表記対応、フォアグラウンド Heartbeat エラー時リトライ暴走修正（batchUpdateTaskLastRun）、heartbeatStore バッチ API（getAllTaskLastRun/batchUpdateTaskLastRun で N+1 IDB アクセス解消）、Push catch ログ改善、fixed-time テスト時刻固定（vi.useFakeTimers）、clearMessages/markExported トランザクション化。テスト 468→472 件（クライアント）+ 29→31 件（サーバー）。（2026-02-28）
- [x] セキュリティ + 重要バグ修正 + レビュードキュメント化 PR-C — MCP ツール SDK レベルフィルタリング（toolFilter）、updatePersona/updateProxy クロージャ修正、Worker heartbeat メモリ関連性スコアリング適用、MAX_MEMORIES 飽和安全弁、全 PR レビューコメント一元管理（docs/REVIEW-TRACKER.md）。テスト 472→474 件。（2026-02-28）
- [x] Push 通知信頼性改善 PR-D — subscribePush 既存 Subscription 再登録時の response.ok チェック追加（4xx はデータ不正として新規作成、5xx/ネットワークエラーは既存継続）、Push 関連レビュー項目 3 件のステータス更新（2 件は既に対応済み確認 + 1 件修正）。テスト 474→477 件。（2026-02-28）
- [x] クライアント側 SSRF 防止 PR-E — `isPrivateIP()` を `server/src/proxy.ts` から `src/core/urlValidation.ts` に移植、`validateUrl()` でプライベート IP ブロック（localhost 除外）。DNS rebinding はブラウザ JS では原理的に検出不可だが CORS プロキシ + サーバー側で多層防御済み。（2026-02-28）
- [x] MCP ツール許可改善 PR-F — `allowedMcpTools` を `"serverName/toolName"` 形式に変更（server-qualified 化）+ callable `toolFilter` でサーバー単位フィルタリング + `groupTasksByMcpTools` でタスク単位のツール分離（グループごとに個別 Agent 実行）。（2026-02-28）
- [x] getAllFromIndex モック正確性改善 PR-G — `__mocks__/db.ts` の `getAllFromIndex` / `transaction.index().getAll()` で multiEntry インデックス（配列フィールド）対応（`Array.isArray` + `includes` 判定）。clipStore.test.ts にタグフィルタ検証テスト追加。（2026-02-28）
- [x] ConversationSidebar アクセシビリティ改善 PR-H — 会話行を `<div onClick>` → `<button>` に変更（`aria-current` でアクティブ状態通知）、削除ボタンに `aria-label`（会話名含む）、`:focus-within` / `:focus-visible` でキーボード操作対応。（2026-02-28）
- [x] モバイル UX 総合改善 PR-I
- [x] ライト/ダークテーマ切替 — ThemeMode 型（light/dark/system）、CSS 変数ライトテーマ定義 + ハードコード色変数化（約 20 箇所）、FOUC 防止（main.tsx 同期適用）、SettingsModal セグメントコントロール UI（即時反映 + 即時保存）、system モード OS 追従リスナー。（2026-02-28） — memory-delete-btn モバイル常時表示 + focus-within 対応、btn-pin hover 依存解消 + タップターゲット拡大、memory-tab サイズ拡大、viewport meta 修正（viewport-fit=cover、ズーム制限解除）、safe-area 左右対応、モーダル padding 縮小、MemoryPanel 削除ボタン aria-label 化。（2026-02-28）
- [x] ストレージ永続化 — `navigator.storage.persist()` 起動時呼び出し（iOS Safari 7日削除対策）+ 設定画面にストレージ情報セクション（永続化ステータス・使用量プログレスバー・PWA インストール案内）。（2026-02-28）
- [x] iOS PWA インストール案内 UI — iOS Safari 未インストール時にチャット画面上部にバナー表示（「共有→ホーム画面に追加」ステップ図解）、設定画面のストレージ・Push セクションにも iOS ガイド追加、dismiss で永続非表示。（2026-03-01）
- [x] ブリーフィング高度化 F9 — `getMemoriesForBriefing()` 追加（mustInclude に goal 追加、context 最低1件確保、limit 15）、instructionBuilder メモリ4グループ分離（目標・締切/現在の状況/記憶/振り返り）、ブリーフィングルール強化（目標参照・残り日数計算）、`createHeartbeatAgent` に tasks 引数追加（briefing 判定で拡張メモリ取得）、heartbeat.ts/heartbeatCommon.ts タスクリスト渡し対応。テスト 599 件。（2026-03-01）
- [x] 期日接近検出 F7 — deadlineParser（日本語日付パース 9パターン: 漢字年月日/スラッシュ/ハイフン/月末/月中旬/月上旬/今月末/来月末 + 年推定・重複排除）、formatGoalsWithDeadlines（残りN日/本日期限/期限超過N日 + #deadline タグ）、Main/Heartbeat 両方の goal セクションに残り日数事前計算注入。テスト 637 件。（2026-03-01）
- [x] 学習継続ナッジ F11 + 無活動検出 F12 — goal メモリの `updatedAt` から活動状態検出（7日ナッジ/14日警告/3日猶予期間）、`formatGoalsWithDeadlines` に活動状態ラベル（`(N日間更新なし)` / `(⚠ N日間更新なし)`）+ `#stale` タグ注入、ブリーフィングルールにナッジ・目標見直し提案指示追加。テスト 651 件。（2026-03-01）
- [x] 多段階 RSS フィルタリング F5+ + フィードバック UI F1 — FeedItem tier 分類（must-read/recommended/skip）、feedStore 分類 API 3 関数、Worker ツール 3 種（listUnreadFeedItems/saveFeedClassification/listClassifiedFeedItems）、feed-check/briefing-morning description 拡張、MAX_TOOL_ROUNDS 3→5、HeartbeatResult feedback フィールド + heartbeatStore setHeartbeatFeedback/filterVisibleResults、HeartbeatPanel フィードバック UI（Accept/Dismiss/Snooze）。テスト 682 件。（2026-03-01）
- [x] Worker 環境 DOMParser 未定義エラー修正 — feedParser.ts を DOMParser → fast-xml-parser に置換（namespace prefix 対応 + Atom XHTML content 再帰抽出）、DOMPurify サニタイズを linkedom 経由で Worker 対応、heartbeatTools.ts checkMonitors を linkedom DOMParser に統一（CSS セレクタ Worker 対応）。テスト 690 件。（2026-03-02）
- [x] テスト体制強化 Session A — sw.ts ロジック抽出（swHandlers.ts）+ ユニットテスト、heartbeat.worker.ts ユニットテスト。テスト 739 件。（2026-03-02）
- [x] テスト体制強化 Session B — ツール定義ユニットテスト 5 種（calendarTool/memoryTool/webSearchTool/deviceInfoTool/heartbeatFeedTools）、useAgentChat/useHeartbeatPanel フックのユニットテスト。テスト 828 件。（2026-03-02）
- [x] テスト体制強化 Session C — vitest カバレッジ対象に tools/**/hooks/** 追加、E2E テストヘルパー拡充（SSE ツール呼び出しモック/ストリーミング完了待機/IDB シード）、E2E テスト拡充（chat-streaming 4テスト/tool-execution 2テスト/heartbeat-panel 5テスト）。E2E 16→27 テスト。（2026-03-02）
- [x] FeedPanel 追加 — RSS 記事ブラウズ用ドロップダウン（useFeedPanel フック + FeedPanel コンポーネント + tier タブフィルタ + 既読化 + 未読バッジ）、Heartbeat feed-check 完了時の自動更新。テスト 844→860 件。（2026-03-02）
- [x] プロアクティブエンジン F8+F6+F2 — 会話内コンテキストサジェスト（memory/clip/feed 横断検索 + instructions 注入）、カレンダーリマインド拡張（searchMemoriesByQuery Worker ツール + calendar-check description 強化）、フィードバック集計 + Reflection 連携（FeedbackSummary 集計 + getHeartbeatFeedbackSummary Worker ツール + reflection description にフィードバック分析手順追加）。テスト 860→876 件。（2026-03-02）
- [x] 閾値トリガー F13 + 週次サマリー F10 — info-cleanup-check ビルトインタスク（20:00、getInfoThresholdStatus Worker ツール: 未分類フィード/未読分類済み/クリップの閾値超過判定）、weekly-summary ビルトインタスク（21:00、LLM 月曜判定 + getWeeklyReflections Worker ツール + フィードバック統計連携）。テスト 876→887 件。（2026-03-02）
- [x] ソース横断トピック統合 F17 — getCrossSourceTopics Worker ツール（RSS+クリップ横断検索、normalizeUrl/extractKeyTokens/countCommonTokens/groupByTopic ヘルパー、Union-Find 二段階マージ: URL完全一致+タイトルキーワード重複≥40%）、briefing-morning description にトピック統合手順追加。（2026-03-02）
- [x] フォーカスモード F4 — HeartbeatConfig に focusMode フィールド追加、3層全て（メインスレッド/Dedicated Worker/SW）の tick でフォーカスモードチェック、ヘッダーにベル/ベルスラッシュ トグルボタン追加、useHeartbeat に toggleFocusMode 関数追加。テスト 887→915 件。（2026-03-02）
- [x] 頻度制御エンジン F3 — 曜日別スキップ（quietDays: HeartbeatConfig）、日次通知上限（maxNotificationsPerDay: recentResults カウント）、チャットサジェスト頻度（suggestionFrequency: AppConfig、high/medium/low で memory/clip/feed 検索範囲制御）、設定 UI（曜日チェックボックス + 上限スライダー + 頻度セレクト）。（2026-03-02）
- [x] 月次レビュータスク F15 — monthly-review ビルトインタスク（08:00 固定スケジュール、LLM 月初判定）、getMonthlyGoalStats Worker ツール（goal メモリの活動状態・期日状態を集計: active/new/stale/overdue 分類 + deadline 残り日数）、computeMonthlyGoalStats 純粋関数（テスト容易性確保）、結果ピン留め。（2026-03-02）
- [x] パターン認識トリガー F14 — pattern-recognition ビルトインタスク（22:00 固定スケジュール）、getUserActivityPatterns Worker ツール（Heartbeat 結果 + Memory から時間帯別 Accept 率・曜日別アクティビティ・タスク別トレンド・タグ頻出度変化を集計）、computeUserActivityPatterns 純粋関数（テスト容易性確保）、reflection 保存で briefing/他タスクが自動参照。（2026-03-03）
- [x] 提案品質の自動最適化 F16 — suggestion-optimization ビルトインタスク（23:30 固定スケジュール）、getSuggestionOptimizations Worker ツール（フィードバック統計 + 行動パターンからタスク別調整方針・タイミング最適化・カテゴリ重み調整を算出）、computeSuggestionOptimizations 純粋関数（テスト容易性確保）、instructionBuilder に最適化ルール専用セクション注入（suggestion-optimization タグ付き reflection を分離、最新1件を「活用すること」指示で挿入）、結果ピン留め。（2026-03-03）
- [x] Action Planning（F16 分析結果の自動実行）— applyHeartbeatConfigAction Worker ツール（toggle-task/update-quiet-hours/update-quiet-days/update-task-interval の4アクション型）、applyAction 純粋関数（バリデーション制約付き）、ActionLogEntry 型 + saveActionLog/loadActionLog（上限100件）、configChanged フラグ伝搬（executeHeartbeatAndStore → Worker → Bridge → useHeartbeat の IDB→localStorage 同期）、suggestion-optimization description にステップ5（自動設定変更）追加。テスト 1015 件。（2026-03-03）
- [x] レビュー環境整備 — Copilot レビュー指示（`.github/copilot-instructions.md` + `security.instructions.md`）、セキュリティスキャン CI（CodeQL + Semgrep SARIF 統合）、Codex CLI レビュー自動化（`openai/codex-action@v1` + PR コメント重複防止）、Copilot レビュー status check（Critical 指摘のみブロック）、Claude Code スキル 3 種（`/review`（4並列サブエージェント: test-runner/security-reviewer/quality-reviewer/performance-reviewer）、`/security-review`（OWASP Top 10 + AI 固有リスク）、`/test-review`（カバレッジ分析 + テスト品質））。（2026-03-03）
- [x] コードベースレビュー指摘5件修正 — Heartbeat 応答パース堅牢化（try-catch + スキーマ検証）、taskLastRun 先制更新（パース失敗時の再実行ループ防止）、送信失敗時エラーメッセージ DB 永続化、stopStreaming タイムアウト付き completed 待機（2秒）、Layer1 Heartbeat Agent ツール不足解消（Worker 20 ツールに合わせて 14 ツール追加、計 21 ツール）。テスト 1015→1031 件。（2026-03-03）
- [x] コードベースレビュー（Full）指摘5件対応 — (1) getConfig JSON.parse 例外処理追加（設定破損時のクラッシュ防止、localStorage 自動リセット）、(2) stopStreaming を AbortController ベースに変更（SDK signal オプションで実際にネットワーク処理をキャンセル）、(3) handleSend try-catch 追加（未処理 Promise rejection 防止、エラーメッセージ UI 表示）、(4) Heartbeat 履歴 pinned 上限超過時に古い pinned を切り捨て（IndexedDB 無限増加防止）、(5) Lint エラー全 18 件修正（react-hooks/set-state-in-effect をレンダー中ステート調整に変更、react-hooks/immutability を useState 宣言順序修正、no-unused-vars/no-explicit-any/no-unsafe-function-type をテストコード含めて解消）。Lint 0 errors。（2026-03-03）
- [x] オフラインフォールバック UI — useOnlineStatus フック（navigator.onLine + online/offline イベント）、OfflineBanner コンポーネント（role="alert" + WiFi オフ SVG）、ChatView/InputBar オフライン時送信無効化 + placeholder 変更 + サジェストボタン disabled、SW NavigationRoute（オフライン時 index.html フォールバック）。テスト 1051→1061 件。（2026-03-04）
- [x] ファイル添付・画像認識（マルチモーダル対応）— Attachment/PendingAttachment 型定義、attachmentStore（IndexedDB attachments ストア、DB_VERSION 10→11）、fileUtils（fileToDataUri/generateThumbnail/validateFile）、InputBar 拡張（クリップアイコン + ファイル選択 + ペーストハンドラ + カメラ capture + プレビュー UI）、useAgentChat 拡張（sendMessage に PendingAttachment[] 対応 + OpenAI Agents SDK UserContent[] 変換: input_image/input_file）、MessageBubble 添付表示（サムネイル + フルサイズ表示 + ファイルアイコン）、ChatView 添付遅延ロード、会話削除時 attachments クリーンアップ。テスト 1061→1096 件。（2026-03-04）
- [x] 音声入出力（Web Speech API）— WebSpeechConfig 型 + config デフォルト/パース、speechService（STT/TTS ユーティリティ: API 検出/SpeechRecognition 生成/SpeechSynthesisUtterance 生成/cancelSpeech/stripMarkdown）、useSpeechInput フック（continuous:false + interimResults + マイク権限エラー処理）、useSpeechOutput フック（Markdown 除去 TTS + voiceschanged 対応）、InputBar マイクボタン（パルスアニメーション + 中間認識テキスト placeholder）、MessageBubble TTS ボタン（ホバー表示 + 再生/停止切替）、App.tsx 自動読み上げ（ストリーミング完了トリガー）、SettingsModal 音声設定セクション（STT/TTS トグル + 自動読み上げ + 速度スライダー + 言語選択）。テスト 1107→1154 件。（2026-03-04）
- [x] 通知パーミッション回復導線（PoC-5）— SettingsModal に通知権限ステータス表示（`default/denied/granted/unsupported`）、状態別の回復ガイド、`権限を再確認` アクション、30 秒ごとの権限再チェック（visibility/focus 追従）を追加。Push 有効化は通知権限 `granted` 時のみ可能にし、誤設定を防止。`SettingsModal` テストを 4 ケース追加。（2026-03-05）
- [x] オンボーディング最適化（PoC-3）— SetupWizard の persona ステップを目的別プリセット（情報収集型 / PM型 / 学習者型）に更新し、`推奨プリセットを適用` の 1 クリック導線を追加。プリセット適用時に persona だけでなく `suggestionFrequency` と推奨 Heartbeat タスク（ビルトイン）を同時に初期化。`SetupWizard` テスト追加 + SetupWizard VRT スナップショット更新。（2026-03-05）
- [x] オンボーディング計測拡張（PoC-3 follow-up）— SetupWizard 操作を `setup-wizard` ops-event として記録（開始/遷移/スキップ/プリセット適用/完了）。`metrics:poc` に完了率・完了時間中央値・推奨プリセット採用率・完了後24hアクティブ率を追加し、週次レビュー/ baseline テンプレートへ自動反映。（2026-03-05）
- [x] コスト制御レイヤー（PoC-6）— Heartbeat に `costControl` 設定（日次トークン予算・逼迫しきい値・非クリティカル次回回し）を追加。タスク別に実行ポリシー（`gpt-5-nano`/`gpt-5-mini` + 出力トークン上限）を適用し、予算逼迫時は縮退モード（出力短縮）に切替。`heartbeat-run` ops-event に token 使用量を保存し、次回実行判定で当日使用量を参照。（2026-03-05）
- [x] 記憶品質ガバナンス（PoC-7 Phase1）— MemoryPanel で記憶の編集（内容/重要度/タグ）と手動無効化（アーカイブ）を追加。`memoryStore` に更新 API と再評価候補抽出（低重要度かつ長期間未参照）を追加し、UI 上で「再評価候補」件数と対象バッジを表示。`memory` ツールに `update/archive/reevaluate` を追加し、Heartbeat Worker には `listMemoryReevaluationCandidates` を追加。（2026-03-05）
