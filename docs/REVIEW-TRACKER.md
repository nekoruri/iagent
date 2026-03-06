# レビューコメント トラッカー

> **2026-02-28 以降、未対応項目は [GitHub Issues](https://github.com/nekoruri/iagent/issues?q=label%3Areview-comment) で管理しています。**
> ラベル `review-comment` でフィルタしてください。
> 長期トラックとの関係は [tracks/README.md](tracks/README.md) と [PROPOSAL-device-agent-research-roadmap.md](PROPOSAL-device-agent-research-roadmap.md) を参照してください。

---

## この文書の役割

この文書は、review-comment 起点の差分を

- 何が未対応か
- 何が修正済みか
- どの長期トラックに効くか

という観点で追うためのトラッカーです。

主に接続する長期トラック:

- `T1 自律実行基盤`
- `T4 オブザーバビリティ基盤`
- `T5 信頼・安全・可視化`
- `T8 端末制約最適化`

---

## 長期トラックとの対応

| トラック | この tracker で主に見る論点 |
|---|---|
| `T1` | push / worker / runtime failure、background 実行の欠陥 |
| `T4` | 通知、feedback、ops-events、説明可能性に関わる追跡性 |
| `T5` | permission、least privilege、notification UX、設定整合 |
| `T8` | rate limiting、fan-out、storage / performance 制約 |

---

## 対応済み

以下は過去の PR レビューで指摘され、すでに修正済みの項目です。

### 2026-03-07 更新で対応反映

| タイトル | カテゴリ | 対応メモ |
|---|---|---|
| Notification API パーミッション再レンダリング | UX | W12 で設定再表示時の権限同期・権限喪失時の UI 整合を修正（Issue #33） |
| TaskProgress クリック可能インジケーター | UX | W12 で開閉 affordance・キーボード操作・展開状態表示を追加（Issue #36） |
| HeartbeatPanel ピン / 変更ありスタイル競合 | UX | W12 で状態ラベルと優先表示を明示化（Issue #43） |
| getConfig() ビルトインタスクマージの永続化 | バグ | 正規化後の設定を localStorage / IndexedDB に再保存し、Worker と main thread のタスク一覧ずれを解消（Issue #41） |
| memoryTool category バリデーション | コード品質 | save/list で無効カテゴリを明示エラーに変更し、silent fallback を廃止（Issue #35） |
| デスクトップ通知にアイコンを追加 | UX | Notification API の icon / badge に PWA アイコンを設定（Issue #34） |
| scoreMemory 負の age 対策 | コード品質 | future timestamp を 0 へクランプし、減衰スコアが不正増幅しないよう修正（Issue #45） |
| React.lazy SettingsModal ローディング表示 | UX | SettingsModal / SetupWizard の lazy import 中に loading shell を表示（Issue #40） |
| contentHash 後方互換バックフィル | バグ | 旧メモリの空 contentHash を一覧取得 / 重複判定時に自動 backfill し、後方互換を回復（Issue #39） |
| フィードサイズ上限のバイト数ベース化 | バグ | 文字数ではなく UTF-8 バイト長で 2MB 上限を判定するよう修正（Issue #38） |
| clearMessages 完全トランザクション化 | パフォーマンス | 会話削除時に `messages / attachments / conversation-meta` を 1 transaction で削除する `deleteConversationData()` に統合（Issue #44） |
| KV list ページング | バグ | `server/src/index.ts` の購読列挙を `listAllSubscriptionKeys()` に集約し、`handleTestPush` / `handleCron` の両方で cursor を最後まで辿る回帰テストを追加（Issue #47） |
| KV レート制限の強整合化 | パフォーマンス | `/proxy` のレート制限を `KV get/put` カウンタから Workers Rate Limiting binding へ置換し、token 保管用 KV と責務分離（Issue #37） |
| cron Push 同時送信（サンダリングハード問題） | パフォーマンス | `handleCron()` を `processInBatches()` 経由の fixed-size concurrency 制御へ変更し、全購読への一括 fan-out を抑制（Issue #46） |

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
| ブリーフィング hasChanges ルール矛盾 | コード品質 | #42 | `config.ts` と `instructionBuilder.ts` の両方で「ブリーフィングタスクは必ず hasChanges: true」を明示しており、特殊ルールとして整合している |

---

## 未対応（GitHub Issues に移行済み）

以下の項目は GitHub Issues に移行しました:

| Issue | タイトル | カテゴリ | 主トラック |
|---|---|---|---|

現時点では、この tracker 上で明示管理している未対応項目はありません。
今後 review-comment 起点の open issue を追加するときは、`主トラック` を併記すること。
