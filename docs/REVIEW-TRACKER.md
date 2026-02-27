# レビューコメント トラッカー

PR#1〜#24 に付いた全レビューコメントを一元管理する。

---

## 凡例

| ステータス | 意味 |
|---|---|
| **PR-C** | PR-C で対応 |
| **PR-D** | PR-D で対応 |
| **対応済み** | 既存の PR で修正済み |
| **問題なし** | 調査の結果、修正不要（根拠付き） |
| **将来対応** | 将来の PR で対応予定 |

カテゴリ: セキュリティ / バグ / パフォーマンス / テスト / コード品質 / ドキュメント / UX

---

## PR-C で対応（本 PR）

### S1. MCP ツール呼び出しの SDK レベルフィルタリング [セキュリティ]
- **PR**: #13 (chatgpt-codex-connector, Copilot), #15 (Copilot)
- **ファイル**: `src/core/agent.ts`
- **問題**: `allowedMcpToolNames` がプロンプト記述のみで、LLM が無視すると許可外ツールを呼べる
- **対応**: `MCPServer.toolFilter` (SDK ネイティブ) で `allowedToolNames` を設定。プロンプトベースは維持（二重防御）

### B1. updatePersona / updateProxy クロージャバグ [バグ]
- **PR**: #12 (Copilot), #15 (Copilot)
- **ファイル**: `src/components/SettingsModal.tsx:87-98`
- **問題**: `updatePersona` / `updateProxy` が外側スコープの変数を参照。連続呼び出しで古い値が使われるステートバッチング問題
- **対応**: `prev.persona ?? getDefaultPersonaConfig()` / `prev.proxy ?? getDefaultProxyConfig()` をベースにマージ

### B2. Worker heartbeat でメモリの関連性スコアリング未使用 [バグ]
- **PR**: #15 (chatgpt-codex-connector, Copilot)
- **ファイル**: `src/core/heartbeatCommon.ts:96-97`
- **問題**: `db.getAll('memories').slice(0, 5)` で ID 順の最初の 5 件を使用。`getRelevantMemories()` が適用されていない
- **対応**: `getRelevantMemories('', 5)` を import して使用

### B3. protected メモリで MAX_MEMORIES 飽和時の安全弁 [バグ]
- **PR**: #17 (chatgpt-codex-connector, Copilot)
- **ファイル**: `src/store/memoryStore.ts:95-102`
- **問題**: `personality` / `routine` のみで MAX_MEMORIES に達するとアーカイブできず無限増加
- **対応**: `archiveLowestScored` で候補 0 件の場合、保護カテゴリ含む全メモリから最低スコアをアーカイブ

---

## 対応済み（PR#23/24 で修正済み）

### Heartbeat スケジュール飢餓問題 [バグ]
- **PR**: #3 (chatgpt-codex-connector, Copilot), #23 で修正
- **内容**: global スケジュールが `state.lastChecked` に依存し、interval/fixed-time タスク実行で更新されてしまう
- **修正**: `taskLastRun` 個別追跡に変更（PR#23）

### フォアグラウンド Heartbeat エラー時リトライ暴走 [バグ]
- **PR**: #23 (chatgpt-codex-connector, Copilot), #24 で修正
- **内容**: エラー時に `lastChecked` のみ更新、`taskLastRun` 未更新で毎分リトライ
- **修正**: エラー時も `batchUpdateTaskLastRun` で一括更新（PR#24）

### heartbeatStore N+1 IDB アクセス [パフォーマンス]
- **PR**: #23 (Copilot), #24 で修正
- **内容**: `getTaskLastRun()` がタスク数ぶん `loadHeartbeatState` を呼ぶ
- **修正**: `getAllTaskLastRun` / `batchUpdateTaskLastRun` バッチ API 追加（PR#24）

### SSRF IPv4-mapped IPv6 16進表記 [セキュリティ]
- **PR**: #12 (chatgpt-codex-connector), #23 (chatgpt-codex-connector, Copilot), #24 で修正
- **内容**: `::ffff:c0a8:0101` 等の 16 進表記でプライベート IP 判定をバイパス可能
- **修正**: 16 進表記の IPv4-mapped IPv6 を IPv4 に復元して再チェック（PR#24）

### プロンプトインジェクション対策 [セキュリティ]
- **PR**: #2 (Copilot), #23 で修正
- **内容**: メモリ内容を instructions にそのまま注入。インジェクションリスク
- **修正**: メモリ注入セクションにガード文追加（PR#23）

### SSRF IPv6 ループバック / ULA / リンクローカル [セキュリティ]
- **PR**: #12 (chatgpt-codex-connector, Copilot), #23 で修正
- **内容**: IPv6 プライベートアドレス範囲が未対応
- **修正**: `isPrivateIP` に IPv6 ループバック/ULA/リンクローカル/IPv4-mapped 判定追加（PR#23）

### MCP ツール制限ガード文強化 [セキュリティ]
- **PR**: #13 (chatgpt-codex-connector), #23 で修正
- **内容**: Heartbeat の MCP ツール許可が instruction ベースのみ
- **修正**: ガード文を明確化（PR#23）。SDK レベルフィルタリングは本 PR (PR-C) で対応

### Worker エラー時リトライ暴走防止 [バグ]
- **PR**: #7 (chatgpt-codex-connector), #23 で修正
- **内容**: Worker の tick() 失敗時に taskLastRun 未更新で即リトライ
- **修正**: エラー時も taskLastRun を更新（PR#23）

### Push 再登録エラーハンドリング [バグ]
- **PR**: #11 (chatgpt-codex-connector, Copilot), #23 で修正
- **内容**: `pushsubscriptionchange` の catch にエラー情報なし
- **修正**: catch ログに原因情報を追加（PR#23, #24）

### MCPServer 接続エラー個別ハンドリング [バグ]
- **PR**: #12 (chatgpt-codex-connector), #23 で修正
- **内容**: `BrowserMCPServer` の URL バリデーション例外が `MCPManager.connectServer()` の try/catch 外
- **修正**: 接続エラーを個別にハンドリング（PR#23）

### fetchFeeds 上限ガード [バグ]
- **PR**: #13 (chatgpt-codex-connector, Copilot), #23 で修正
- **内容**: Worker 側 fetchFeeds に MAX_ITEMS_PER_FEED 相当の制限なし
- **修正**: 上限ガード追加（PR#23）

### fixed-time スケジュール見逃し防止 [バグ]
- **PR**: #3 (Copilot), #23 で修正
- **内容**: ±1分ウィンドウで見逃す可能性
- **修正**: todayStart ベースの判定に変更（PR#23）

### package.json private フラグ [コード品質]
- **PR**: #14 (chatgpt-codex-connector), #23 で修正
- **内容**: `"private": true` 削除で accidental npm publish リスク
- **修正**: private フラグ復元（PR#23）

### clearMessages トランザクション化 [パフォーマンス]
- **PR**: #5 (Copilot), #24 で修正
- **内容**: 1件ずつ await db.delete で遅い + 途中失敗リスク
- **修正**: readwrite トランザクション内で一括削除（PR#24）

### fake timers リーク防止 [テスト]
- **PR**: #24 (Copilot), #24 で修正
- **内容**: `vi.useFakeTimers()` / `vi.useRealTimers()` が例外時にリークする
- **修正**: afterEach で確実に復帰（PR#24）

---

## 対応済み（PR-D で修正）

### Push Subscription サーバー側存在確認 [バグ]
- **PR**: #11 (Copilot), PR-D で修正
- **内容**: ブラウザに既存 Subscription があってもサーバー側で削除済みの場合に再登録しない
- **修正**: `subscribePush` で既存 Subscription の再登録時に `response.ok` チェック追加。HTTP エラー時は既存を破棄して新規作成にフォールスルー（PR-D）

---

## 対応済み（PR-E で修正）

### DNS Rebind / 内部向けレコード対策 [セキュリティ]
- **PR**: #12 (Copilot), PR-E で修正
- **内容**: ドメインがプライベート IP に解決されるケースの SSRF 対策
- **修正**: クライアント側 `validateUrl()` に `isPrivateIP()` チェック追加（`server/src/proxy.ts` から移植）。DNS rebinding はブラウザ JS では原理的に検出不可だが、CORS プロキシ経由アーキテクチャ + サーバー側 `isPrivateIP()` で多層防御済み

---

## 対応済み（PR-F で修正）

### MCP ツール許可キーの server-qualified 化 [コード品質]
- **PR**: #13 (chatgpt-codex-connector, Copilot), PR-F で修正
- **内容**: `allowedMcpTools` が `toolName` のみで、複数サーバーの同名ツールが区別不可
- **修正**: `allowedMcpTools` の値を `"serverName/toolName"` 形式に変更。`agent.ts` の static `toolFilter` を callable `toolFilter` に変更し、サーバー名+ツール名でフィルタリング。`/` なしのレガシーエントリは後方互換で任意サーバーにマッチ

### MCP ツール許可のタスク単位制御 [コード品質]
- **PR**: #13 (Copilot), PR-F で修正
- **内容**: タスクごとに許可した MCP ツールが他タスクでも利用可能
- **修正**: `heartbeat.ts` にタスクグループ化関数 `groupTasksByMcpTools` を追加。同一 `allowedMcpTools` セットのタスクをグループ化し、グループごとに個別の Agent を作成・実行。異なるツールセットのタスク間でツールが混在しない

---

## 調査の結果問題なし

### Push サーバー URL バリデーション [セキュリティ]
- **PR**: #11 (Copilot)
- **根拠**: `pushSubscription.ts` の全 fetch 呼び出し箇所（Subscription の登録・更新・削除処理など）で `validateUrl()` を使用済み。HTTPS 強制 + プライベート IP ブロックが適用されている

### Push 一時的エラーでの Subscription 削除 [バグ]
- **PR**: #11 (chatgpt-codex-connector)
- **根拠**: `server/src/index.ts:200-212` で HTTP ステータスコードに基づく適切なハンドリング済み。404/410 のみ KV から削除し、429/500 等の一時的エラーでは Subscription を保持する実装になっている

### OtlpExporter.start() 未呼び出し [バグ]
- **PR**: #4 (chatgpt-codex-connector, Copilot)
- **根拠**: `useAgentChat` フックの計装で `exporter.start()` は呼ばれている。tracer.ts の `enqueue()` → `flush()` パスで正常動作。設定 UI の有効/無効切り替えで start/stop も管理されている

### OtelConfig 型の重複 [コード品質]
- **PR**: #4 (Copilot)
- **根拠**: `src/types/index.ts` が正規の型定義で、`src/telemetry/types.ts` は telemetry モジュール内のローカル型。実用上問題なく、telemetry モジュールの独立性を保つ設計判断として妥当

### SettingsModal JSON ヘッダー入力の配列チェック [コード品質]
- **PR**: #4 (Copilot)
- **根拠**: `typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)` で配列を除外済み（PR#4 の実装時点で対応）

### 初回起動で activeConversationId が null [バグ]
- **PR**: #5 (chatgpt-codex-connector, Copilot)
- **根拠**: `useConversations` フック内で会話 0 件の場合に自動作成するロジックが後続の PR で追加済み。初回起動時の導線も正常に動作

### 会話切替時の historyRef 復元 [コード品質]
- **PR**: #5 (Copilot)
- **根拠**: 意図的な設計判断。会話ごとに独立した LLM コンテキストを持ち、保存済みメッセージは UI 表示用。切替時にヒストリをリセットすることで、コンテキストウィンドウの肥大化を防止

### Worker config null 参照 [バグ]
- **PR**: #7 (Copilot)
- **根拠**: Worker は `start` / `stop` メッセージで状態管理。`stop` 時に `config=null` にした後は `tick()` は呼ばれない。メッセージハンドラ内のガード条件で安全

### telemetry markExported バッチ化 [パフォーマンス]
- **PR**: #4 (Copilot)
- **根拠**: PR#24 で conversationStore の clearMessages/markExported がトランザクション化済み。telemetry 側は MAX_TRACES=200 の小規模データで、個別更新でも実用上問題なし

### Heartbeat Layer 1 ツール不足 [コード品質]
- **PR**: #13 (Copilot)
- **根拠**: Layer 1（メインスレッド）の Heartbeat はタブ表示中のみ動作し、ツール呼び出しは Layer 2/3 (Worker/SW) に委譲される設計。Layer 1 は通知表示に特化しており、フル機能は不要

### PeriodicSync 最小間隔のドキュメント [ドキュメント]
- **PR**: #11 (Copilot)
- **根拠**: フォールバック機構であり、ユーザーへの直接的影響は限定的。Chrome の 12 時間制限は仕様であり、Push 通知が主要な wake-up 手段として機能

---

## 対応済み（PR-G で修正）

### getAllFromIndex モックの正確性改善 [テスト]
- **PR**: #2 (Copilot), PR-G で修正
- **内容**: `__mocks__/db.ts` の `getAllFromIndex` が multiEntry インデックス（配列フィールド）に非対応
- **修正**: `getAllFromIndex` と `transaction.index().getAll()` のフィルタで `Array.isArray(value) ? value.includes(query) : value === query` に変更。clipStore.test.ts に multiEntry タグフィルタの検証テスト追加

---

## 対応済み（PR-H で修正）

### アクセシビリティ改善 (ConversationSidebar) [UX]
- **PR**: #5 (Copilot), PR-H で修正
- **内容**: 会話行が `<div onClick>` でキーボード操作不可。削除ボタンに aria-label なし
- **修正**: 会話行を `<button>` に変更（`aria-current` でアクティブ状態通知）、削除ボタンに `aria-label` で会話名を含む識別情報追加、`:focus-within` でキーボードフォーカス時も削除ボタン表示、`:focus-visible` フォーカスリング追加

---

## 将来対応

### Notification API パーミッション再レンダリング [UX]
- **PR**: #1 (Copilot)
- **内容**: 通知許可後に UI が即座に更新されない
- **優先度**: 低

### 通知アイコン追加 [UX]
- **PR**: #1 (Copilot)
- **内容**: デスクトップ通知に icon プロパティ未設定
- **優先度**: 低

### memoryTool category バリデーション [コード品質]
- **PR**: #2 (Copilot)
- **内容**: `z.string()` で任意文字列を許容。`z.enum()` にすべき
- **優先度**: 低

### TaskProgress クリック可能インジケーター [UX]
- **PR**: #3 (Copilot)
- **内容**: 展開可能なステップに視覚的なインジケーターなし
- **優先度**: 低

### KV レート制限の強整合化 [パフォーマンス]
- **PR**: #12 (Copilot)
- **内容**: Workers KV の get→put でカウント競合の可能性
- **優先度**: 低（現状の使用規模では実害なし）

### フィードサイズ上限のバイト数ベース化 [バグ]
- **PR**: #13 (Copilot)
- **内容**: `text.length` ベースで UTF-8 バイト数と不一致
- **優先度**: 低

### contentHash 後方互換バックフィル [バグ]
- **PR**: #17 (chatgpt-codex-connector, Copilot)
- **内容**: pre-v10 メモリの contentHash が空で重複検出不可
- **優先度**: 低（新規メモリには正常適用）

### React.lazy SettingsModal ローディング表示 [UX]
- **PR**: #16 (chatgpt-codex-connector, Copilot)
- **内容**: Suspense fallback が null でローディング中に UI フィードバックなし
- **優先度**: 低

### getConfig() ビルトインタスクマージの永続化 [バグ]
- **PR**: #17 (chatgpt-codex-connector)
- **内容**: in-memory でのみビルトインタスクをマージし IDB に永続化しない
- **優先度**: 低（Worker パスでは IDB から直接読み込み、ビルトインタスクは常にマージ）

### ブリーフィング hasChanges ルール矛盾 [コード品質]
- **PR**: #20 (Copilot)
- **内容**: 「通知する価値がある情報のみ hasChanges: true」と「ブリーフィングは必ず true」の矛盾
- **優先度**: 低

### モバイルでのメモリ削除ボタン [UX]
- **PR**: #22 (chatgpt-codex-connector)
- **内容**: hover のみで表示されるため、タッチデバイスで到達不可
- **優先度**: 中

### HeartbeatPanel ピン / 変更ありスタイル競合 [UX]
- **PR**: #22 (Copilot)
- **内容**: pinned と changed が同時適用された場合の border 競合
- **優先度**: 低

### clearMessages 完全トランザクション化 [パフォーマンス]
- **PR**: #24 (Copilot)
- **内容**: 読み取りがトランザクション外で整合性リスク
- **優先度**: 低（現状の使用パターンでは実害なし）

### scoreMemory 負の age 対策 [コード品質]
- **PR**: #17 (Copilot)
- **内容**: now < m.updatedAt の場合にスコアが膨張する可能性
- **優先度**: 低（クロックスキューは稀）

### cron Push 同時送信（サンダリングハード問題） [パフォーマンス]
- **PR**: #11 (Copilot)
- **内容**: 全 Subscription に同時 push でスパイク発生の可能性
- **優先度**: 低（少数ユーザーの PoC では問題なし）

### KV list ページング [バグ]
- **PR**: #11 (chatgpt-codex-connector)
- **内容**: cron ハンドラが KV list の 1 ページ分のみ処理
- **優先度**: 低（1000 件未満の規模では問題なし）

