# iAgent 運用ガイド（Push / CORS Proxy）

このドキュメントは `server/` の Cloudflare Workers を使って、iAgent の次を運用するための手順です。

- Heartbeat 用 Push wake-up サーバー
- CORS プロキシ（RSS / Web監視用）

端末 / ブラウザ別の current capability は [tracks/T1-capability-matrix.md](tracks/T1-capability-matrix.md) を参照してください。

## この文書の役割

この文書は、**Push / Proxy / server 運用の現在手順**を説明する source of truth です。

主に支える長期トラック:

- `T1 自律実行基盤`
- `T8 端末制約最適化`

proposal との違い:

- proposal は方向性や検討事項
- operations は実際に運用するときの手順

を扱います。

## 1. 役割

`server/` は次の機能を提供します。

- Push 購読登録・解除
- VAPID 公開鍵配布
- Cron（15分間隔）で全購読へ wake-up push 送信
- プロキシトークン発行（`/register`）
- 認証付き CORS プロキシ（`/proxy`）

## 2. 前提条件

- Cloudflare アカウント
- Node.js（`server/package.json` のスクリプトを実行できる環境）
- Wrangler CLI
- KV Namespace を 2 つ作成できる権限
- Rate Limiting binding を設定できる権限

## 3. サーバーセットアップ

```bash
cd server
npm install
cp wrangler.toml.example wrangler.toml
```

## 4. VAPID 鍵の生成

```bash
npm run generate-vapid
```

出力された `VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY` を控えます。

## 5. KV Namespace の作成

```bash
wrangler kv namespace create SUBSCRIPTIONS
wrangler kv namespace create RATE_LIMIT
```

作成時に表示される `id` を `wrangler.toml` の次に設定します。

- `[[kv_namespaces]] binding = "SUBSCRIPTIONS"`
- `[[kv_namespaces]] binding = "RATE_LIMIT"`

## 5.1 Rate Limiting binding の設定

`/proxy` のレート制限は Cloudflare Workers Rate Limiting binding を利用する。

`wrangler.toml` に以下を設定する:

```toml
[[ratelimits]]
name = "PROXY_RATE_LIMITER"
namespace_id = "1001" # アカウント内で一意な整数
simple = { limit = 30, period = 60 }
```

補足:

- `namespace_id` は KV のような作成済みリソース ID ではなく、アカウント内で一意な整数
- 既存の rate limiting 設定と衝突する場合は別の整数へ変更する
- `RATE_LIMIT` KV は proxy token 保管に継続利用し、レートカウンタ用途では使わない

## 6. Secret の設定

```bash
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT
wrangler secret put PROXY_MASTER_KEY
```

推奨:

- `VAPID_SUBJECT` は `mailto:...` 形式
- `PROXY_MASTER_KEY` は十分長いランダム値

## 7. デプロイ

```bash
npm run deploy
```

成功すると Workers URL（例: `https://your-worker.workers.dev`）が発行されます。

## 8. 動作確認

### 8.1 ヘルスチェック

```bash
curl https://your-worker.workers.dev/health
```

期待値:

```json
{"status":"ok"}
```

### 8.2 VAPID 公開鍵確認

```bash
curl https://your-worker.workers.dev/vapid-public-key
```

### 8.3 Push テスト（任意）

```bash
curl -X POST https://your-worker.workers.dev/test-push
```

- 購読がある場合: 各購読への送信結果を返す
- 購読がない場合: `登録済み購読なし`

## 9. クライアント接続手順（iAgent 側）

### 9.1 Push の有効化

1. iAgent 設定 → Heartbeat → バックグラウンド Push
2. `Push サーバーURL` に Workers URL を入力
3. `Push 通知を有効化` を ON

内部的に次が行われます。

- `/vapid-public-key` 取得
- ブラウザ Push 購読
- `/subscribe` へ登録

補足:

- Push が利用できない場合は Periodic Background Sync がフォールバックします。
- ただし実行間隔はブラウザ実装依存で、Chrome/Edge は最短でも約 12 時間、iOS Safari は非対応です。

### 9.2 Proxy の有効化

1. iAgent 設定 → CORS プロキシ
2. `プロキシサーバーURL` に Workers URL を入力
3. `マスターキー` を入力して「トークン取得」
4. 成功後、`有効` を ON

内部的に次が行われます。

- `/register` に `Bearer <PROXY_MASTER_KEY>` でアクセス
- 返却された token を `authToken` として保存
- 以後 `/proxy` を `Bearer <token>` で利用

## 10. エンドポイント一覧

| メソッド | パス | 用途 |
|---|---|---|
| `GET` | `/health` | 稼働確認 |
| `GET` | `/vapid-public-key` | Push 公開鍵取得 |
| `POST` | `/subscribe` | Push 購読登録 |
| `POST` | `/unsubscribe` | Push 購読解除 |
| `POST` | `/test-push` | 手動一斉 push テスト |
| `POST` | `/register` | Proxy トークン発行（マスターキー認証） |
| `POST` | `/proxy` | 認証付き CORS プロキシ |

## 11. セキュリティ仕様（Proxy）

`/proxy` には次の防御が実装されています。

- Bearer トークン認証
- レート制限（Workers Rate Limiting binding、60秒あたり30リクエスト）
- SSRF 防止（localhost/プライベートIP拒否）
- HTTPS 強制
- リダイレクト追跡時の再検証（最大5回）
- レスポンスサイズ制限（2MB）
- タイムアウト（15秒）

## 12. 運用チェックリスト

- `/health` が 200 を返す
- Cron が 15 分ごとに実行される（Workers Logs）
- 無効購読（404/410）が自動削除される
- Proxy の 401/429/504 が異常増加していない
- `PROXY_MASTER_KEY` が漏えいしていない

## 13. トラブルシューティング

| 症状 | 典型原因 | 対応 |
|---|---|---|
| Push 登録失敗 | VAPID secret 未設定 | secret を再設定して再デプロイ |
| `/proxy` が 401 | トークン不正/未設定 | iAgent 設定でトークン再取得 |
| `/proxy` が 429 | レート制限超過 | クライアント側アクセス頻度を調整 |
| `/proxy` が 400 | URL 不正、SSRF 対象、2MB超過 | URL/サイズ/対象ドメインを確認 |
| `/proxy` が 504 | 上流タイムアウト | 上流サイト状態確認、再試行 |
| Push が届かない | 購読切れ、通知権限、iOS未インストール | 再購読、権限確認、PWA化 |

## 14. 補足

- サーバーはユーザーの OpenAI API キーやメモリ本文を保存しません
- 保存対象は Push Subscription と Proxy トークン（KV）です
- Heartbeat 本体ロジックはクライアント側（Service Worker を含む）で実行されます
