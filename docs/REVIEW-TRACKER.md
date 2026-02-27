# レビューコメント トラッカー

> **2026-02-28 以降、未対応項目は [GitHub Issues](https://github.com/nekoruri/iagent/issues?q=label%3Areview-comment) で管理しています。**
> ラベル `review-comment` でフィルタしてください。

---

## 対応済み

以下は過去の PR レビューで指摘され、すでに修正済みの項目です。

### PR-C で対応

| ID | タイトル | カテゴリ | 元 PR |
|---|---|---|---|
| S1 | MCP ツール呼び出しの SDK レベルフィルタリング | セキュリティ | #13, #15 |
| B1 | updatePersona / updateProxy クロージャバグ | バグ | #12, #15 |
| B2 | Worker heartbeat でメモリの関連性スコアリング未使用 | バグ | #15 |
| B3 | protected メモリで MAX_MEMORIES 飽和時の安全弁 | バグ | #17 |

### PR#23/24 で対応

| タイトル | カテゴリ | 元 PR |
|---|---|---|
| Heartbeat スケジュール飢餓問題 | バグ | #3 |
| フォアグラウンド Heartbeat エラー時リトライ暴走 | バグ | #23 |
| heartbeatStore N+1 IDB アクセス | パフォーマンス | #23 |
| SSRF IPv4-mapped IPv6 16進表記 | セキュリティ | #12, #23 |
| プロンプトインジェクション対策 | セキュリティ | #2 |
| SSRF IPv6 ループバック / ULA / リンクローカル | セキュリティ | #12 |
| MCP ツール制限ガード文強化 | セキュリティ | #13 |
| Worker エラー時リトライ暴走防止 | バグ | #7 |
| Push 再登録エラーハンドリング | バグ | #11 |
| MCPServer 接続エラー個別ハンドリング | バグ | #12 |
| fetchFeeds 上限ガード | バグ | #13 |
| fixed-time スケジュール見逃し防止 | バグ | #3 |
| package.json private フラグ | コード品質 | #14 |
| clearMessages トランザクション化 | パフォーマンス | #5 |
| fake timers リーク防止 | テスト | #24 |

### PR-D〜I で対応

| タイトル | カテゴリ | 対応 PR |
|---|---|---|
| Push Subscription サーバー側存在確認 | バグ | PR-D |
| DNS Rebind / 内部向けレコード対策 | セキュリティ | PR-E |
| MCP ツール許可キーの server-qualified 化 | コード品質 | PR-F |
| MCP ツール許可のタスク単位制御 | コード品質 | PR-F |
| getAllFromIndex モックの正確性改善 | テスト | PR-G |
| アクセシビリティ改善 (ConversationSidebar) | UX | PR-H |
| モバイルでのメモリ削除ボタン | UX | PR-I |

---

## 調査の結果問題なし

| タイトル | カテゴリ | 元 PR | 根拠 |
|---|---|---|---|
| Push サーバー URL バリデーション | セキュリティ | #11 | `validateUrl()` で HTTPS 強制 + プライベート IP ブロック適用済み |
| Push 一時的エラーでの Subscription 削除 | バグ | #11 | HTTP ステータスコードに基づく適切なハンドリング済み |
| OtlpExporter.start() 未呼び出し | バグ | #4 | useAgentChat 計装で正常呼び出し済み |
| OtelConfig 型の重複 | コード品質 | #4 | telemetry モジュールの独立性を保つ設計判断 |
| SettingsModal JSON ヘッダー入力の配列チェック | コード品質 | #4 | `!Array.isArray(parsed)` で除外済み |
| 初回起動で activeConversationId が null | バグ | #5 | 会話 0 件時の自動作成ロジックで対応済み |
| 会話切替時の historyRef 復元 | コード品質 | #5 | 意図的設計（コンテキストウィンドウ肥大化防止） |
| Worker config null 参照 | バグ | #7 | stop 時のガード条件で安全 |
| telemetry markExported バッチ化 | パフォーマンス | #4 | MAX_TRACES=200 の小規模で実害なし |
| Heartbeat Layer 1 ツール不足 | コード品質 | #13 | Layer 1 は通知表示に特化した設計 |
| PeriodicSync 最小間隔のドキュメント | ドキュメント | #11 | Push 通知が主要な wake-up 手段で影響限定的 |

---

## 未対応（GitHub Issues に移行済み）

以下の項目は GitHub Issues に移行しました:

| Issue | タイトル | カテゴリ |
|---|---|---|
| #33 | Notification API パーミッション再レンダリング | UX |
| #34 | デスクトップ通知にアイコンを追加 | UX |
| #35 | memoryTool category バリデーション | コード品質 |
| #36 | TaskProgress クリック可能インジケーター | UX |
| #37 | KV レート制限の強整合化 | パフォーマンス |
| #38 | フィードサイズ上限のバイト数ベース化 | バグ |
| #39 | contentHash 後方互換バックフィル | バグ |
| #40 | React.lazy SettingsModal ローディング表示 | UX |
| #41 | getConfig() ビルトインタスクマージの永続化 | バグ |
| #42 | ブリーフィング hasChanges ルール矛盾 | コード品質 |
| #43 | HeartbeatPanel ピン / 変更ありスタイル競合 | UX |
| #44 | clearMessages 完全トランザクション化 | パフォーマンス |
| #45 | scoreMemory 負の age 対策 | コード品質 |
| #46 | cron Push 同時送信（サンダリングハード問題） | パフォーマンス |
| #47 | KV list ページング | バグ |
