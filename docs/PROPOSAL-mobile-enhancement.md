# 提案: スマートフォン対応強化

> ステータス: **Tier 1 / Tier 2 の主要項目は実装済み**。残りは信頼性検証と運用磨き込み（2026-03-07 更新）
> 注記: 本文は 2026-02-28 時点の提案メモ。現行の完了状況は [ROADMAP.md](ROADMAP.md) フェーズ 3 を優先する。

## 背景

iAgent は「スマートフォンや PC 上でクライアントサイドの自律型 AI エージェントを実現する PoC」であり、スマホブラウザできちんと動くことが核心体験である。

現状、PWA 対応（standalone + maskable アイコン）、Heartbeat 3層構成、サイドバーのドロワー化、ボトムシート化、セーフエリア対応（PWA モード限定）等の基盤はあるが、以下の課題が残っている:

- iOS Safari でキーボード表示時に入力バーが隠れる
- iOS では PWA インストールなしに Push 通知が使えないが、インストール案内がない
- ボタンのタップターゲットが一部小さい
- SettingsModal がモバイルで使いづらい（7セクション一括表示）
- オフライン時のフォールバック UI がない
- iOS Safari の 7日ストレージ削除リスクへの対策がない

---

## 現状のモバイル対応状況

### 対応済み

| 項目 | 実装 |
|---|---|
| PWA マニフェスト | `display: standalone`、192/512px アイコン、maskable |
| Service Worker | Workbox precache + Push + Periodic Sync |
| セーフエリア | `env(safe-area-inset-*)` — PWA standalone モード限定 |
| ドロワーサイドバー | `@media (max-width: 768px)` でスライドイン |
| ボトムシート | Heartbeat/Memory パネルを `@media (max-width: 600px)` で下部固定 |
| viewport meta | `width=device-width, initial-scale=1.0, viewport-fit=cover` |
| セットアップウィザード | モーダル形式（max-width: 520px、モバイル時 padding 縮小） |
| E2E モバイルテスト | Pixel 7 ビューポートでドロワー動作テスト |

### CSS ブレークポイント

| メディアクエリ | 用途 |
|---|---|
| `@media (display-mode: standalone)` | PWA インストール時のセーフエリア適用 |
| `@media (max-width: 768px)` | サイドバー→ドロワー、モーダル padding 縮小 |
| `@media (max-width: 600px)` | メッセージバブル 90%、提案縦並び、ボトムシート |

---

## iOS 固有の制約事項

調査日: 2026-02-28

| 制約 | 影響 | 対策方針 |
|---|---|---|
| キーボード表示時に Layout Viewport が変わらない | `position: fixed; bottom: 0` の入力バーが隠れる | `dvh` + VisualViewport API |
| Push 通知に PWA インストールが必須（iOS 16.4+） | インストールしないとバックグラウンドエージェントが動かない | カスタムインストール案内 UI |
| `beforeinstallprompt` イベントなし | インストール促進を自動化できない | 手動ガイド UI（共有→ホーム画面に追加） |
| 7日間未使用でストレージ自動削除（Safari ブラウザ内） | 会話履歴・メモリが消失するリスク | `navigator.storage.persist()` + PWA インストール推奨 |
| Background Sync / Periodic Background Sync 非対応 | オフライン時のリクエスト遅延送信不可 | Push 通知タイミングでの実行に限定 |
| SW イベントリスナーが発火しないケースがある | Push 通知の信頼性が低い | Declarative Web Push（Safari 18.4+）の検討 |
| 全ブラウザが WebKit ベース | Chrome/Firefox も iOS では Safari と同じ制約 | Safari 基準で設計する |

---

## 強化タスク

### Tier 1: 必須（スマホで「ちゃんと動く」最低ライン）

#### M1: iOS キーボード対応

**問題**: iOS Safari でキーボード表示時に `100vh` がキーボードを含む高さのまま変わらず、入力バーがキーボードの下に隠れる。チャットアプリとして致命的。

**対策**:
- `height: 100vh` → `height: 100dvh`（Dynamic Viewport Height）に変更
- VisualViewport API の `resize` イベントで CSS カスタムプロパティ `--app-height` を動的更新
- `dvh` 未対応ブラウザ向けのフォールバック

**変更対象**: `src/index.css`（`.app-container`, `.app`, `.app-main`）、`src/components/InputBar.tsx`

#### M2: iOS PWA インストール案内 UI

**問題**: iOS では PWA をホーム画面に追加しないと Push 通知が使えない。しかし Android と異なり自動プロンプトがないため、ユーザーがインストール方法を知らない。

**対策**:
- `display-mode: standalone` を検出してインストール済み判定
- 未インストール + iOS の場合、チャット画面上部にインストール案内バナーを表示
- 「共有ボタン → ホーム画面に追加」のステップ図解
- 一度非表示にしたら localStorage で記憶（再表示しない）
- Heartbeat 設定時にもインストールを促す導線

**新規ファイル**: `src/components/InstallPrompt.tsx`、`src/core/installDetect.ts`

#### M3: タップターゲットサイズの統一

**問題**: 一部のボタン（Heartbeat ピン、Memory 削除、ウィザードのプリセット等）が推奨最小サイズ 44x44px を下回っており、指での操作がしづらい。

**対策**:
- すべてのインタラクティブ要素に `min-height: 44px; min-width: 44px` を保証
- 視覚的サイズが小さいアイコンボタンは `padding` で当たり判定を拡大
- 対象: `.btn-icon`, `.btn-pin`, `.memory-delete-btn`, `.wizard-preset-btn`, `.wizard-step-dot`（表示のみなので除外可）

**変更対象**: `src/index.css`

---

### Tier 2: 重要（モバイル体験を「快適」にする）

#### M4: SettingsModal のモバイル最適化

**問題**: 7セクションの長大なモーダルがモバイルでは使いづらい。スクロール量が多く、どこに何があるか分かりにくい。

**対策**:
- モバイル（768px 以下）でフルスクリーン表示に切替
- セクションのアコーディオン折りたたみ、または タブ/ナビゲーション形式
- 保存/キャンセルボタンをフッター固定

**変更対象**: `src/components/SettingsModal.tsx`、`src/index.css`

#### M5: サイドバーのスワイプジェスチャ

**問題**: 現在はハンバーガーボタンのタップのみでドロワーを開閉する。モバイルユーザーは画面端からのスワイプ操作が自然。

**対策**:
- 画面左端からの右スワイプでサイドバーを開く
- サイドバー上で左スワイプで閉じる
- `touch{start,move,end}` イベントでスワイプ検出（ライブラリ不要、自前実装）
- スワイプ中のドロワー追従アニメーション

**新規ファイル**: `src/hooks/useSwipeDrawer.ts`

#### M6: オフラインフォールバック UI

**問題**: オフライン時に白画面や API エラーが表示される。モバイルではトンネルや電波の悪い場所での使用が前提。

**対策**:
- Service Worker の precache 対象に `index.html` + 主要アセットを確保（既に Workbox で対応済み、確認のみ）
- `navigator.onLine` + `online`/`offline` イベントでオンライン状態を検知
- オフライン時はヘッダーにバナー表示（「オフラインです — 過去の会話は閲覧できます」）
- 送信ボタンを disabled にし、理由を tooltip で表示
- キャッシュ済みの会話履歴は閲覧可能

**新規ファイル**: `src/hooks/useOnlineStatus.ts`、`src/components/OfflineBanner.tsx`

#### M7: ストレージ永続化

**問題**: iOS Safari（ブラウザ内）は 7日間未使用でスクリプト書き込みストレージを削除する。会話履歴やメモリが消失するリスク。

**対策**:
- アプリ起動時に `navigator.storage.persist()` を呼び出し
- 永続化が拒否された場合、インストール案内（M2）と組み合わせて PWA インストールを推奨
- 設定画面にストレージ状態の表示（`navigator.storage.estimate()` で使用量/割り当て表示）

**変更対象**: `src/App.tsx`（起動時）、`src/components/SettingsModal.tsx`（状態表示）

---

### Tier 3: 差別化（「スマホでこそ価値がある」体験）

#### M8: Declarative Web Push 対応検討

Safari 18.4+ で SW 不要の Push 通知が可能に。iOS での SW 不安定問題を回避でき、バックグラウンドエージェントの信頼性向上が期待できる。現状は調査・設計フェーズ。

#### M9: Periodic Background Sync の UI 説明

実際の最小間隔（12時間）と iOS 非対応の事実を設定画面で説明し、ユーザーの期待値を調整する。

#### M10: モバイル E2E テスト拡充

- SetupWizard のモバイルビューポートテスト
- InputBar のキーボード表示シミュレーション
- ドロップダウン（Heartbeat/Memory）のボトムシート動作
- Visual Regression テスト（Playwright スクリーンショット比較）

#### M11: 通知パーミッション管理の強化

Chrome の自動取り消し対策（低エンゲージメント判定）+ iOS のインストール必須制約を考慮した、パーミッション状態の定期チェックと再要求フロー。

---

## ROADMAP 既存項目との対応

| ROADMAP 既存項目 | 本提案での位置 |
|---|---|
| レスポンシブ改善（モバイル最適化） | M1, M3, M4 に分解 |
| Service Worker キャッシュ戦略の改善 | M6 に含む |
| オフライン時のフォールバック UI | M6 |
| iOS PWA インストール導線 | M2 |
| Chrome 通知パーミッション自動取り消し対策 | M11 |
| Declarative Web Push 対応検討 | M8 |
| Periodic Background Sync ドキュメント | M9 |
| Visual Regression テスト | M10 に含む |

---

## 推奨実装順序

```
M1 (キーボード) → M2 (インストール案内) → M3 (タップターゲット)
→ M4 (設定画面最適化) → M5 (スワイプ) → M6 (オフライン)
→ M7 (ストレージ永続化) → M10 (モバイル E2E)
→ M8, M9, M11 (Push 信頼性)
```

M1 はチャットアプリとして致命的な問題のため最優先。M2 はバックグラウンドエージェントの核心体験に直結するため次点。

---

## 参考情報

- [PWA on iOS - Brainhub (2025)](https://brainhub.eu/library/pwa-on-ios)
- [Safari 18.4 Release Notes - Apple Developer](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes)
- [VisualViewport API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [Dynamic Viewport Units (`dvh`) - web.dev](https://web.dev/blog/viewport-units)
- [Safari 26.0 Release Notes - Apple Developer](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes)
