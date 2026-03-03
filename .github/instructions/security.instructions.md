---
applyTo: "src/**/*.{ts,tsx}"
---
# セキュリティレビュー指示

## プロンプトインジェクション対策
- instructionBuilder で構築される instructions にユーザー入力が混入する経路を確認
- メモリ注入セクション（`<user_memories>` タグ内）のガード文が存在するか
- Heartbeat タスクの description にユーザー制御可能な文字列がないか
- MCP ツールの出力がそのまま instructions に含まれる箇所がないか

## 外部コンテンツの処理
- RSS/Atom フィードの HTML コンテンツは DOMPurify でサニタイズされているか
- クリッピング内容のサニタイズ
- Web ページ監視の HTML パース結果のサニタイズ
- marked でレンダリングされるユーザー入力の事前サニタイズ

## URL バリデーション
- MCP サーバー URL: validateUrl() で HTTPS 強制 + プライベート IP ブロック
- CORS プロキシ経由のアクセス: fetchViaProxy() のドメイン制限
- Push サーバー URL: validateUrl() 適用
- 新規追加される外部 URL アクセスに validateUrl が適用されているか

## IndexedDB アクセス
- トランザクション境界の正確性
- 競合状態（複数の Layer が同時アクセスする場合）
- ユーザー入力が直接キーやインデックスに使用されていないか
