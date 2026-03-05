# iAgent 利用ガイド

このドキュメントは、iAgent を日常利用するための操作手順と設定方法をまとめたガイドです。
実装の現在値（`src/` と `server/`）に合わせて作成しています。

## 1. iAgent の概要

iAgent はブラウザ上で動くパーソナル AI アシスタントです。主な特徴は次のとおりです。

- OpenAI Agents SDK によるチャット（ストリーミング応答）
- ローカルデータ（IndexedDB / localStorage）を使った継続利用
- ビルトインツール 7 種（カレンダー、検索、デバイス、メモリ、クリップ、フィード、Webページ監視）
- Heartbeat による定期チェック（バックグラウンド実行）
- MCP サーバー連携
- PWA インストール対応

## 2. クイックスタート

### 2.1 開発環境で起動

```bash
npm install
npm run dev
```

ブラウザで起動すると、OpenAI API キー未設定時は初回セットアップウィザードが表示されます。

### 2.2 初回セットアップ（SetupWizard）

1. Welcome 画面で開始
2. `OpenAI API Key` を入力（必須）
3. 必要に応じて `Brave Search API Key`、`OpenWeatherMap API Key` を入力（任意）
4. エージェント名・性格・話し方を設定
   - 利用目的プリセットを選択（`情報収集型` / `PM型` / `学習者型`）
   - `推奨プリセットを適用` で推奨値を 1 クリック反映
   - プリセット適用時は `suggestionFrequency` と推奨 Heartbeat タスク（ビルトイン）が同時に初期化
5. 任意で Heartbeat を有効化

最小構成は OpenAI API キーのみです。

## 3. 画面構成と基本操作

### 3.1 チャット画面

- 入力欄で `Enter` 送信（`Shift+Enter` で改行）
- 返答はストリーミング表示
- 応答中は停止ボタン（`■`）で中断可能
- ツール実行中は `ToolIndicator` / `TaskProgress` が表示

### 3.2 会話サイドバー

- 会話の作成・切替・削除
- 初回メッセージ送信時、会話タイトルは先頭 30 文字で自動設定
- モバイルでは左端から右スワイプで開き、開いた状態で左スワイプすると閉じる

### 3.3 ヘッダーの各パネル

- 記憶パネル（脳アイコン）
  - カテゴリ別にメモリ閲覧
  - メモリ編集（内容・重要度・タグ）
  - メモリ無効化（手動アーカイブ）/ 削除
  - 再評価候補（低重要度かつ長期間未参照）の表示
- フィードパネル（RSSアイコン）
  - 未読の分類済み記事（`must-read` / `recommended`）を表示
  - クリックで既読化
- Heartbeat パネル（ベルアイコン）
  - 実行結果一覧
  - ピン留め
  - フィードバック（`✓` / `×` / スヌーズ）

### 3.4 設定モーダル

右上 `⚙` から開きます。利用の中心はこの画面です。

### 3.5 iOS インストール案内

iOS Safari かつ未インストール時は、ホーム画面追加の案内バナーが表示されます。

## 4. 設定ガイド（SettingsModal）

### 4.1 基本設定

- テーマ: `dark` / `light` / `system`
- API キー
  - `OpenAI API Key`（必須）
  - `Brave Search API Key`（Web検索で使用）
  - `OpenWeatherMap API Key`（天気取得で使用）
  - 保存済みキーは直接再表示されず、変更時のみ再入力
  - 各キーで `保存済みキーを削除` / `削除を取り消す` が可能
- セキュリティ（PoC）
  - `最小権限プリセットを適用` で、Heartbeat/通知/音声入出力/MCP接続/プロキシ有効化を一括で無効化
  - Push 購読がある場合はプリセット適用時に自動解除（失敗時は基本設定の `Push 解除を再試行` で再実行）

### 4.2 エージェント設定

- エージェント名
- 性格・特徴
- 話し方
- 追加指示
- チャット内サジェスト頻度 (`suggestionFrequency`)
  - `high`: memory + clip + feed を参照
  - `medium`: memory のみ参照
  - `low`: memory を最小件数で参照

### 4.3 MCP Servers

- MCP サーバーの追加・有効化・削除
- クイック追加（MCPプリセット）
  - 単体追加: `GitHub / Notion / RSS Reader / Slack / Gmail / Google Calendar`
  - 一括追加: `推奨セットを追加`（`GitHub / Notion / RSS Reader`）
  - 追加時は URL テンプレートが自動入力されるため、実環境のエンドポイントに書き換えて保存
- 接続状態: `未接続 / 接続中 / 接続済み / エラー`
- URL 制約
  - 原則 `https://`
  - `localhost` は例外で許可
  - プライベート IP は拒否

### 4.4 Heartbeat

Heartbeat は定期チェック機能です。設定項目:

- `有効` トグル
- デスクトップ通知
  - 通知権限ステータス表示（未設定 / ブロック中 / 許可済み / 非対応）
  - `権限を再確認` ボタン（ブラウザ設定変更後の再チェック）
- チェック間隔（1〜120分）
- 深夜スキップ（開始時刻〜終了時刻）
- スキップ曜日（日〜土）
- 日次通知上限（0=無制限）
- コスト制御（PoC）
  - 日次トークン予算（0=無制限）
  - 予算逼迫しきい値（%）
  - 予算逼迫時の非クリティカルタスク次回回し
- ビルトインタスク個別ON/OFF
- カスタムタスク
  - 追加・削除
  - スケジュール: `global` / `interval` / `fixed-time`
  - 時間帯条件: `なし` / `時間帯指定`（開始時刻〜終了時刻、`start=end` は終日）
  - Heartbeat 実行時に許可する MCP read-only ツール選択

### Heartbeat の実行レイヤー

- Layer 1: タブ表示中（メインスレッド）
- Layer 2: タブ非表示（Dedicated Worker）
- Layer 3: タブ閉鎖後（Service Worker + Push/Periodic Sync）

補足:

- `focusMode` が ON の間は通知実行を停止
- 実行結果は Heartbeat パネルに蓄積
- `dismissed` はパネル非表示、`snoozed` は期限まで非表示

### 4.5 バックグラウンド Push

`Heartbeat` セクション内で設定します。

- `Push サーバーURL` を入力
- `Push 通知を有効化` で購読登録
  - 通知権限が `granted` のときのみ有効化可能
- 解除時は購読解除
- Push が利用できない場合は Periodic Background Sync がフォールバック（Chrome/Edge は最短でも約 12 時間、iOS Safari は非対応）
- 参考: サーバー構築は [OPERATIONS.md](OPERATIONS.md)

iOS の場合:

- Safari 単体ではなく、ホーム画面に追加した PWA での利用が前提

### 4.6 CORS プロキシ

RSS フィード取得と Web 監視で利用します。

- `有効` トグル
- `プロキシサーバーURL`
- `マスターキー` でトークン取得（保存されない）
- `authToken` 保存後にプロキシ利用可能
- `許可ドメイン`（空なら全許可）

重要:

- `feed` / `web_monitor` はプロキシ未設定だと取得できません

### 4.7 オブザーバビリティ（OTel）

- `有効` トグル
- OTLP エンドポイント
- 送信ヘッダー（JSON）

有効時、チャット/Heartbeat のトレースがローカル保存され、OTLP 送信されます。

### 4.8 ストレージ

- 永続化状態（永続化済み / 未永続化）
- 使用量 / クォータ表示
- データポータビリティ（バックアップ/復元）
  - `データをエクスポート`: 設定・会話・記憶・記憶アーカイブ・添付を JSON ファイルとして保存
  - `データをインポート`: バックアップ JSON から上書き復元
  - 復元後は `再読み込みして反映` を実行して、画面状態と保存データを同期

## 5. ビルトインツール 7 種

| ツール名 | 主用途 | 主な前提 |
|---|---|---|
| `calendar` | 予定一覧・作成・リマインダー作成 | なし |
| `web_search` | Brave Search API で Web 検索 | Brave APIキー |
| `device_info` | バッテリー・位置・天気 | 位置権限、OpenWeatherMap APIキー（天気時） |
| `memory` | 長期記憶の保存/検索/一覧/更新/無効化/再評価候補取得 | なし |
| `clip` | Web情報の構造化保存・検索 | なし |
| `feed` | RSS/Atom 購読・取得・一覧 | CORSプロキシ |
| `web_monitor` | Webページ変化監視 | CORSプロキシ |

## 6. Heartbeat ビルトインタスク（12種）

デフォルト有効は `calendar-check` のみです。他は初期状態で無効です。

| タスクID | 名称 | 初期状態 | 既定スケジュール | 概要 |
|---|---|---|---|---|
| `calendar-check` | カレンダーチェック | 有効 | global | 予定と関連メモリを参照して通知 |
| `weather-check` | 天気チェック | 無効 | global | 天気変化の確認 |
| `feed-check` | フィードチェック | 無効 | global | 新着記事取得と3段階分類 |
| `rss-digest-daily` | RSSダイジェスト | 無効 | 08:00 固定 | 分類済み記事の要約と注目トピック集約 |
| `web-monitor-check` | Webページ監視 | 無効 | global | 監視ページの差分検出 |
| `reflection` | ふりかえり | 無効 | 23:00 固定 | 記憶・フィードバック分析と保存 |
| `info-cleanup-check` | 情報整理チェック | 無効 | 20:00 固定 | 未整理情報の閾値超過検出 |
| `weekly-summary` | 週次サマリー | 無効 | 21:00 固定 | 週次レビュー生成 |
| `monthly-review` | 月次レビュー | 無効 | 08:00 固定 | goal 集計と月次レビュー |
| `pattern-recognition` | パターン認識 | 無効 | 22:00 固定 | 行動パターン分析 |
| `suggestion-optimization` | 提案品質の最適化 | 無効 | 23:30 固定 | ルール生成と設定調整 |
| `briefing-morning` | 朝のブリーフィング | 無効 | 07:00 固定 | 予定/情報を要約して通知 |

## 7. 日常運用の例

### 7.1 最小運用（チャット中心）

1. OpenAI API キーのみ設定
2. 必要時にチャットで問い合わせ
3. メモリ蓄積を利用

### 7.2 自動通知運用（Heartbeat）

1. Heartbeat を有効化
2. `calendar-check` と必要タスクを有効化
3. 通知が多い場合は次を調整
   - チェック間隔を長くする
   - quiet hours / quiet days を設定
   - 日次通知上限を設定
   - focus mode を使用
4. 自動設定変更の履歴を確認したい場合は、設定の Heartbeat セクションで `自動実行ログ（Action Planning）` を開く

### 7.3 情報収集運用（RSS/監視）

1. CORS プロキシを有効化
2. `feed` ツールで購読登録
3. `web_monitor` ツールで監視対象追加
4. `feed-check` / `web-monitor-check` を Heartbeat で有効化

## 8. トラブルシューティング

| 症状 | 主な原因 | 対応 |
|---|---|---|
| `OpenAI APIキーが設定されていません` | APIキー未設定 | 設定の基本設定で OpenAI キーを保存 |
| Web検索が失敗する | Brave APIキー未設定 | Brave キーを設定 |
| 天気が取得できない | 位置権限拒否 / APIキー未設定 | ブラウザ位置権限を許可、OpenWeatherMap キー設定 |
| RSS取得/監視が失敗する | CORSプロキシ未設定 or 無効 | Proxy セクションで URL/トークン設定・有効化 |
| Push が登録できない | サーバーURL不正 / サーバー未構築 | URL確認、[OPERATIONS.md](OPERATIONS.md) でサーバー準備 |
| 通知が来ない | 通知権限 denied / focus mode ON / OS 側通知 OFF | ブラウザの通知権限を許可 → 設定画面で `権限を再確認` 実行、focus mode を解除、OS 通知設定を確認 |
| 自動で設定が変わった理由が分からない | Action Planning の適用履歴が未確認 | 設定画面 → Heartbeat → `自動実行ログ（Action Planning）` で reason/detail と時刻を確認し、必要なら `再読み込み` |
| MCP 接続がエラー | URL不正/CORS/サーバー停止 | MCP URL見直し、MCPサーバー側設定確認 |

## 9. データ保存仕様と上限

| 項目 | 保存先 | 上限/仕様 |
|---|---|---|
| 会話履歴 | IndexedDB `conversations` | conversationId 単位で保存 |
| 会話メタ | IndexedDB `conversation-meta` | 作成日時/更新日時/件数 |
| メモリ | IndexedDB `memories` | 最大 200 件（低スコア記憶はアーカイブへ） |
| クリップ | IndexedDB `clips` | 最大 500 件、1件最大 100KB |
| フィード | IndexedDB `feeds` | 最大 50 フィード |
| フィード記事 | IndexedDB `feed-items` | 1フィードあたり最大 100 件 |
| 監視対象 | IndexedDB `monitors` | 最大 20 件 |
| Heartbeat 結果 | IndexedDB `heartbeat` | recentResults 最大 50 件 |
| Action log | IndexedDB `heartbeat` | 最大 100 件 |
| テレメトリ | IndexedDB `traces` | 最大 200 トレース |
| 設定 | localStorage + IndexedDB `config` | 同期保存 |

## 10. 既知の制約

- URL バリデーションにより、`localhost` 以外の HTTP URL は拒否
- プライベート IP 宛て URL は拒否
- `periodicSync` はブラウザ依存（Chrome/Edge は最短でも約 12 時間、iOS Safari は非対応）
- Battery API はブラウザ非対応の場合あり
- Push 通知はブラウザとインストール状態（特に iOS）に依存

## 11. 関連ドキュメント

- [運用ガイド（Push/Proxy サーバー）](OPERATIONS.md)
- [アーキテクチャ詳細](ARCHITECTURE.md)
- [ロードマップ](ROADMAP.md)
