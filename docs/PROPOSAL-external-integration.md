# 提案: 外部情報収集・自律行動の強化

> ステータス: **Phase A/B/C 実装済み**（2026-02-26）
> → ROADMAP 反映済み: [docs/ROADMAP.md](ROADMAP.md) フェーズ 4 参照

## 背景

iAgent は現在、4 つのビルトインツール（カレンダー、Web 検索、デバイス情報、メモリ）と MCP 連携、Heartbeat 3 層構成を持つ。
次のステップとして、**外部からの情報収集**と**エージェントの自発的な行動**を強化したい。

---

## 3 つの強化軸

### 軸 1: ビルトインツールの拡充

#### 1-1. RSS/フィード収集ツール (`feedTool.ts`)

- フィード URL の購読管理（IndexedDB に保存）
- `subscribe` / `unsubscribe` / `list_feeds` / `fetch` / `fetch_all`
- Heartbeat タスク「フィードチェック」で定期的に新着検出 → 通知
- **CORS 対策が必須**（後述）

#### 1-2. Web ページ監視ツール (`webMonitorTool.ts`)

- URL + CSS セレクタで監視対象を登録
- `watch` / `unwatch` / `check`
- Heartbeat 連携: 定期巡回 → テキスト差分（ハッシュ比較）→ 変化時に通知
- ユースケース: 価格変動、在庫復活、公式サイト更新

#### 1-3. クリッピングツール (`clipTool.ts`)

- 収集情報を構造化保存（URL/タイトル/要約/タグ）
- memoryTool との棲み分け: memoryTool = ユーザー文脈、clipTool = 外部情報スニペット
- `clip` / `search_clips` / `summarize`

### 軸 2: MCP エコシステムの活用

既存の MCP 接続基盤を活かし、外部 MCP サーバー接続で機能拡張する。

#### 推奨 MCP サーバー

| カテゴリ | MCP サーバー | できること |
|---------|-------------|-----------|
| ナレッジ | Notion MCP | DB/ページの読み書き、タスク管理 |
| メール | Gmail MCP (google-mcp) | メール検索・送信・ラベル管理 |
| カレンダー | Google Calendar MCP | Google カレンダー連携 |
| ファイル | Google Drive MCP | ドキュメント/スプレッドシート操作 |
| コード | GitHub MCP | Issue/PR 操作、リポジトリ検索 |
| RSS | RSS Reader MCP | フィード購読・取得（CORS 回避にも有効） |
| ニュース | HackerNews MCP | トップ記事・コメント取得 |
| ブラウジング | Playwright MCP / Fetch MCP | Web ページ取得・操作 |
| Slack | Slack MCP | メッセージ検索・投稿 |

#### MCP 関連の改善案

- **MCP ツールの Heartbeat 対応**: 現在 Heartbeat (Layer 2/3) は MCP ツール非対応。統合すればバックグラウンドで外部サービスを定期巡回可能に
- **MCP プリセット UI**: よく使われるサーバーをワンクリック追加
- **MCP サーバーのローカル起動支援**: Electron/Tauri 化時に `npx` 経由起動

### 軸 3: エージェントの自律性強化

#### 情報収集ワークフロー（Heartbeat 拡張）

| タスク | 説明 | スケジュール例 |
|--------|------|---------------|
| RSS ダイジェスト | 登録フィードの新着を要約 | 毎朝 8:00 (fixed-time) |
| ニュースブリーフィング | トレンドニュース収集・要約 | 毎朝 7:30 |
| Web ページ変更チェック | 監視 URL の差分検出 | 2 時間ごと (interval) |
| GitHub 通知チェック | MCP 経由で Issue/PR 更新監視 | 30 分ごと |
| メールダイジェスト | MCP 経由で未読メール要約 | 1 時間ごと |
| Notion 日次レビュー | タスク DB ステータス確認 | 毎晩 21:00 |

#### プロアクティブ提案エンジン

- 「今日のブリーフィング」— カレンダー + 天気 + RSS + メールの統合日次レポート
- 「関連情報の提示」— チャット中に過去のクリップやフィード記事を自動サジェスト
- 「タスクリマインド」— 期日の近いタスクをリマインド

#### Action Planning（チェック → 判断 → アクション）

```
フィード新着検出
  → 重要度判定（メモリのユーザー関心事と照合）
  → 重要 → 即通知 + クリップ保存
  → 低重要度 → 日次ダイジェストにバッチ
```

---

## 実装優先度

| 優先度 | 機能 | 理由 |
|--------|------|------|
| **高** | RSS フィードツール + Heartbeat 連携 | ビルトインで完結、最小工数 |
| **高** | MCP Heartbeat 対応 | MCP エコシステム全体が自律実行可能に |
| **中** | Web ページ監視ツール | RSS 非対応サイトの変更監視 |
| **中** | MCP プリセット UI | 導入障壁を下げる |
| **中** | クリッピング/ナレッジベース | 収集情報の蓄積先 |
| **低** | プロアクティブ提案エンジン | 上記基盤が整ってから |
| **低** | Action Planning | 最もアドバンスド、基盤整備後 |

---

## 横断的課題: CORS 対策

ブラウザからの外部 API/RSS 取得は CORS が最大の障壁。

| 方式 | 用途 | メリット | デメリット |
|------|------|---------|-----------|
| Vite プロキシ | 開発時 | 設定のみ | 本番不可 |
| Cloudflare Workers プロキシ | 本番 | 既存 `server/` 拡張 | サーバー依存 |
| MCP サーバー経由 | 汎用 | CORS 完全回避 | MCP サーバー起動必要 |
| 公開 CORS プロキシ | 手軽 | 設定不要 | 信頼性・セキュリティに課題 |

**推奨**: 開発は Vite プロキシ、本番は既存 Cloudflare Workers に CORS プロキシ機能追加。
MCP サーバー経由も並行して対応し、ユーザーが選択できるようにする。

---

## セキュリティ考慮事項

> 2026-02-26 コードレビューに基づく精査結果

### 既存のセキュリティ現状

外部連携を拡張する前に、現在の基盤で認識すべき状態:

| 領域 | 現状 | 評価 |
|------|------|------|
| XSS 防止 | DOMPurify v3.3.1 で sanitize 済み | 良好 |
| Web Push 暗号化 | AES-128-GCM + VAPID ECDSA P-256 | 良好 |
| API キー保管 | localStorage / IndexedDB に**平文** | 要改善 |
| CSP ヘッダー | **未設定** | 要改善 |
| Push サーバー認証 | **なし**（誰でも subscribe 可能） | PoC 上は許容 |
| MCP URL バリデーション | **なし**（HTTP も許可） | 要改善 |

### 1. CORS プロキシのセキュリティ

CORS プロキシは**オープンリレーになるリスク**が最大の懸念。

#### リスク

- **悪用（オープンプロキシ化）**: 第三者が CORS プロキシを経由して任意の URL にアクセス → スパム送信やスクレイピングの踏み台に
- **SSRF（Server-Side Request Forgery）**: プロキシ経由で内部ネットワーク（`localhost`, `169.254.x.x` 等）にアクセス
- **コスト爆発**: Cloudflare Workers の無制限利用

#### 対策（必須）

```
1. 許可リスト方式
   - プロキシ対象を特定ドメイン/パスに限定
   - 例: RSS フィード URL のみ許可（Content-Type: application/rss+xml, application/atom+xml, text/xml）

2. SSRF 防止
   - プライベート IP レンジへのリクエストを拒否
     (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
   - リダイレクト先も検証（リダイレクトで内部 IP に誘導される攻撃）

3. レート制限
   - Cloudflare Workers の Rate Limiting ルール設定
   - IP ベース + エンドポイントごとの制限

4. 認証トークン
   - クライアントが署名付きリクエストを送信
   - HMAC(url + timestamp, shared_secret) で正規クライアント確認

5. レスポンスサイズ上限
   - 巨大ファイルのプロキシ防止（例: 1MB 上限）
```

### 2. RSS/フィードツールのセキュリティ

#### リスク

| リスク | 説明 | 深刻度 |
|--------|------|--------|
| **XSS（XML インジェクション）** | 悪意あるフィードの `<title>` や `<description>` に `<script>` 等 | 中（DOMPurify で緩和済み） |
| **XXE（XML External Entity）** | XML パーサーが外部エンティティを展開し機密データ漏洩 | 高 |
| **フィード爆弾** | 巨大 XML で DoS（メモリ枯渇、パース時間） | 中 |
| **フィッシング URL** | フィード内リンクが悪意あるサイトへ誘導 | 低（ユーザー判断） |

#### 対策

```
1. XXE 防止
   - fast-xml-parser を使用（Worker / Service Worker 環境でも動作）
   - XMLValidator で事前バリデーション、parseTagValue: false で型変換防止

2. サイズ制限
   - フィード取得時のレスポンスサイズ上限（例: 2MB）
   - 1 フィードあたりの記事数上限（例: 100 件）
   - 購読フィード数の上限（例: 50 件）

3. コンテンツ sanitize
   - フィード内の HTML コンテンツは DOMPurify で sanitize してから保存
   - URL は new URL() でパース検証

4. 取得頻度の制限
   - フィードごとの最小取得間隔（例: 5 分）
   - HTTP Cache-Control / ETag / Last-Modified を尊重
```

### 3. Web ページ監視ツールのセキュリティ

#### リスク

| リスク | 説明 | 深刻度 |
|--------|------|--------|
| **任意 URL フェッチ** | SSRF と同様、内部ネットワークへのアクセス | 高 |
| **認証情報の漏洩** | Cookie 付きリクエストで認証済みページの情報が漏洩 | 中 |
| **大量リクエスト** | 監視対象が多い場合に DDoS 類似の振る舞い | 中 |
| **悪意あるコンテンツ** | 取得 HTML 内の悪意あるスクリプト | 中（DOMPurify で緩和） |

#### 対策

```
1. URL 制限
   - HTTPS のみ許可
   - プライベート IP 拒否（CORS プロキシと同様）
   - 監視対象 URL 数の上限（例: 20 件）

2. フェッチポリシー
   - fetch() に credentials: 'omit' を明示（Cookie 送信防止）
   - リダイレクト回数上限（redirect: 'follow' ではなく手動制御、最大 3 回）

3. コンテンツ処理
   - 取得した HTML はテキスト抽出のみ（スクリプト実行しない）
   - メインスレッド: ブラウザネイティブ DOMParser でパース
   - Worker 環境: linkedom の DOMParser でパース（CSS セレクタ対応）
   - 指定 CSS セレクタの textContent のみ取得、innerHTML は使用しない
```

### 4. MCP Heartbeat 対応のセキュリティ

#### リスク

| リスク | 説明 | 深刻度 |
|--------|------|--------|
| **バックグラウンドでの無制限ツール実行** | ユーザー不在時に MCP ツールが書き込み操作を実行 | 高 |
| **MCP サーバーの信頼性** | 悪意あるツールがバックグラウンドで API キーを送信 | 高 |
| **API コスト増大** | Heartbeat が頻繁に MCP ツールを呼び出しコスト増 | 中 |

#### 対策

```
1. Heartbeat 用 MCP ツール許可リスト
   - 全 MCP ツールを Heartbeat で使えるのではなく、
     ユーザーが明示的に「Heartbeat で使用可」にチェックしたツールのみ実行
   - デフォルトは全てオフ

2. 読み取り専用制約
   - Heartbeat での MCP ツール実行は read-only 操作のみ許可
   - 書き込み操作（メール送信、ファイル作成等）はチャット内でのみ許可
   - MCP ツール名にプレフィックス規約（例: list_*, get_*, search_* のみ許可）

3. MCP サーバー URL の検証強化
   - HTTPS 必須（localhost は開発時のみ例外）
   - 接続時に TLS 証明書の有効性を確認（ブラウザが自動で実施）
```

### 5. クリッピングツールのセキュリティ

#### リスク

低リスク。IndexedDB へのローカル保存のみ。

#### 対策

```
1. 保存コンテンツの sanitize
   - 保存前に DOMPurify で HTML sanitize
   - URL は new URL() で検証

2. 容量制限
   - クリップ数の上限（例: 500 件）
   - 1 クリップあたりのサイズ上限（例: 100KB）
```

### 6. 横断的セキュリティ改善（外部連携の前提として推奨）

外部連携を拡張すると、既存の弱点がより深刻になる。以下は外部連携機能の実装と並行して対応すべき項目:

#### 6-1. CSP ヘッダーの導入（優先度: 高）

外部コンテンツを大量に取り込むようになると XSS リスクが高まる。CSP で防御層を追加する。

```html
<!-- index.html に追加 -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.openai.com https://api.search.brave.com
    https://api.openweathermap.org wss: https:;
  worker-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'none';
">
```

#### 6-2. API キー保管の改善（優先度: 中）

外部連携で API キーの種類が増えるほど、平文保管のリスクが増大する。

```
選択肢:
A. Web Crypto API で暗号化（パスフレーズベース PBKDF2 + AES-GCM）
   → 起動時にパスフレーズ入力が必要になり UX が悪化
B. 現状維持 + CSP 強化で XSS 自体を防ぐ
   → PoC としては現実的

推奨: まず CSP を導入し、API キー暗号化は本番化フェーズで検討
```

#### 6-3. Push サーバーの認証追加（優先度: 中）

CORS プロキシ機能を `server/` に追加する場合、認証なしだとオープンプロキシ化する。

```
推奨: CORS プロキシ追加と同時に、共有シークレットベースの HMAC 認証を導入
- クライアントが HMAC(url + timestamp, secret) をヘッダーに付与
- サーバーが検証して通過させる
- secret はユーザーが設定画面で入力（Push Server URL と同時に設定）
```

### セキュリティ対応の実装順序

```
Phase A: 外部連携の前提整備
  ├─ CSP ヘッダー導入
  └─ MCP URL バリデーション（HTTPS 強制）

Phase B: CORS プロキシ（RSS/監視ツールの基盤）
  ├─ 許可リスト方式 + SSRF 防止
  ├─ レート制限
  ├─ HMAC 認証
  └─ レスポンスサイズ上限

Phase C: 各ツール実装時に個別対策
  ├─ RSS: サイズ制限、sanitize、取得頻度制限
  ├─ Web 監視: credentials:'omit'、URL 制限
  ├─ MCP Heartbeat: 許可リスト、read-only 制約
  └─ クリッピング: 容量制限、sanitize
```
