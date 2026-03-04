# マルチモーダル対応レビュー指摘対応

## 概要

コミット `a58b9e1` のマルチモーダルファイル添付機能に対するレビュー結果に基づく修正事項。

## レビュー結果

- テスト: 全 1096 件合格
- 型チェック: 合格
- ESLint: 違反なし
- 判定: **Needs Attention**（Critical なし、Medium 以上の指摘あり）

## 修正対応（優先度順）

### 1. [High/Security] MIME タイプホワイトリスト検証の追加

**ファイル**: `src/core/fileUtils.ts:19-28`

`validateFile()` にファイルサイズのみチェックで MIME タイプ検証がない。ペースト経由で SVG（XSS ベクタ）等の危険なファイルが添付可能。

**対応**: `ALLOWED_MIME_TYPES` ホワイトリストを追加し、`validateFile()` で検証。

### 2. [High/Performance] ChatView useEffect 依存配列の修正

**ファイル**: `src/components/ChatView.tsx:51`

`useEffect` の依存配列に `attachmentMap` が含まれ、更新のたびに不要な再実行が発生。

**対応**: 依存配列から `attachmentMap` を削除し、`useRef` で最新値を参照。

### 3. [Medium/Performance] generateThumbnail のメモリリーク防止

**ファイル**: `src/core/fileUtils.ts:49-84`

Image/Canvas オブジェクトのクリーンアップが未実施。

**対応**: `img.src = ''`、`img.onload = null` 等で明示的に解放。

### 4. [Medium/Security] window.open(dataUri) → Blob URL 変更

**ファイル**: `src/components/MessageBubble.tsx:55`

巨大 data URI を `window.open()` で新タブに開くと DoS リスク。

**対応**: Blob URL を使用し、タイムアウト後に `revokeObjectURL()`。

### 5. [Medium/Security] ファイル名サニタイズの追加

**ファイル**: `src/hooks/useAgentChat.ts:80,126`

ファイル名がサニタイズなしで IndexedDB 保存・API 送信される。

**対応**: `sanitizeFilename()` 関数を追加（パス区切り除去 + 長さ制限）。

### 6. [Medium/Quality] UserContent 型定義の厳密化

**ファイル**: `src/hooks/useAgentChat.ts:118`

`contents` の型が `{ type: string; ... }` で曖昧。

**対応**: 判別共用体型 `UserContentItem` を定義。

### 7. [Medium/Quality] catch ブロックのエラーログ出力

**ファイル**: `src/components/InputBar.tsx:97-99`

catch でエラーオブジェクトを破棄している。

**対応**: `console.error` でログ出力。

## 将来対応（ROADMAP 追加）

- data URI → Blob 保存への移行（メモリ最適化）
- N+1 クエリ解消（`getAttachmentsByMessageIds()` バッチ関数）
- Web Worker でサムネイル生成（メインスレッドブロック回避）
- サムネイル失敗時のフォールバック画像

## 関連

- ROADMAP: フェーズ 3 > マルチモーダル対応
