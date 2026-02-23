# テストプラン: Notification API 統合

## 概要

Heartbeat 機能にブラウザ Notification API を統合し、タブがバックグラウンドでもデスクトップ通知を受信できるようにする。

**対象 PR**: [#1 Add desktop notification support for Heartbeat](https://github.com/nekoruri/iagent/pull/1)

---

## 自動テスト

| テストファイル | テスト数 | 内容 |
|---|---|---|
| `src/core/notifier.test.ts` | 10 | Notification API ラッパーの単体テスト |
| `src/core/config.test.ts` | 11 | `desktopNotification` のデフォルト値・フォールバックテスト含む |

### 実行方法

```bash
npm test
```

### notifier.test.ts のカバレッジ

- `isNotificationSupported`: サポート有無の判定（2ケース）
- `getNotificationPermission`: `unsupported` / `granted` 等の返却値（2ケース）
- `requestNotificationPermission`: API 非対応時 / 正常リクエスト時（2ケース）
- `sendHeartbeatNotifications`: 通知作成・複数通知・permission denied・onclick ハンドラ（4ケース）

### config.test.ts の追加分

- `getDefaultHeartbeatConfig` に `desktopNotification: false` が含まれること
- 既存 localStorage データに `desktopNotification` が無い場合、デフォルト値 `false` でマージされること

---

## 手動テスト

### 前提条件

- `npm run dev` でローカル開発サーバーを起動
- OpenAI API Key が設定済み

---

### TC-01: 設定画面の表示

| 項目 | 内容 |
|---|---|
| **手順** | 歯車アイコン → 設定モーダルを開く |
| **期待結果** | Heartbeat セクション内に「デスクトップ通知」チェックボックスが表示される |

### TC-02: 通知権限リクエスト（許可）

| 項目 | 内容 |
|---|---|
| **前提** | 通知権限が未設定（default）の状態 |
| **手順** | 1. 「デスクトップ通知」を ON にする<br>2. ブラウザの権限ダイアログで「許可」を選択<br>3. 「保存」をクリック |
| **期待結果** | チェックが ON のまま保持される |

### TC-03: 通知権限リクエスト（拒否）

| 項目 | 内容 |
|---|---|
| **前提** | 通知権限が未設定（default）の状態 |
| **手順** | 1. 「デスクトップ通知」を ON にする<br>2. ブラウザの権限ダイアログで「ブロック」を選択 |
| **期待結果** | チェックが ON にならない（OFF のまま） |

### TC-04: 権限ブロック時の UI

| 項目 | 内容 |
|---|---|
| **前提** | ブラウザ設定で通知をブロック済み（Chrome: アドレスバー鍵アイコン → サイトの設定 → 通知 → ブロック） |
| **手順** | 設定モーダルを開く |
| **期待結果** | 1. チェックボックスが disabled<br>2. 「通知がブロックされています。ブラウザの設定から許可してください。」が表示される |

### TC-05: デスクトップ通知の受信

| 項目 | 内容 |
|---|---|
| **前提** | 通知権限が許可済み |
| **手順** | 1. 設定: Heartbeat 有効 / 間隔 10分 / 通知 ON / カレンダーチェック有効<br>2. チャットで「15分後にテスト予定を追加」等でカレンダーに予定を登録<br>3. Heartbeat の実行を待つ（最大10分） |
| **期待結果** | デスクトップ通知がポップアップ表示される |

### TC-06: 通知クリック時のフォーカス

| 項目 | 内容 |
|---|---|
| **前提** | TC-05 で通知が表示された状態 |
| **手順** | 1. 別のタブやアプリに切り替える<br>2. 通知をクリックする |
| **期待結果** | iAgent のウィンドウ/タブにフォーカスが戻る |

### TC-07: バックグラウンド継続（通知 ON）

| 項目 | 内容 |
|---|---|
| **前提** | Heartbeat 有効 + デスクトップ通知 ON |
| **手順** | 1. 別のタブに切り替える<br>2. Heartbeat のチェック間隔まで待つ |
| **期待結果** | タブが非アクティブでも通知が届く |

### TC-08: バックグラウンド停止（通知 OFF）

| 項目 | 内容 |
|---|---|
| **前提** | Heartbeat 有効 + デスクトップ通知 OFF |
| **手順** | 1. 別のタブに切り替える<br>2. Heartbeat のチェック間隔まで待つ |
| **期待結果** | タブが非アクティブの間 Heartbeat が停止し、通知が来ない |

### TC-09: 設定の永続化

| 項目 | 内容 |
|---|---|
| **手順** | 1. 通知 ON で保存<br>2. ページをリロード<br>3. 設定モーダルを開く |
| **期待結果** | 「デスクトップ通知」が ON のまま保持されている |

### TC-10: 旧データからのマイグレーション

| 項目 | 内容 |
|---|---|
| **手順** | 1. DevTools Console で以下を実行:<br>`const c = JSON.parse(localStorage.getItem('iagent-config'));`<br>`delete c.heartbeat.desktopNotification;`<br>`localStorage.setItem('iagent-config', JSON.stringify(c));`<br>2. ページをリロード<br>3. 設定モーダルを開く |
| **期待結果** | 「デスクトップ通知」が OFF（デフォルト）で正常表示される |

---

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---|---|---|
| `src/types/index.ts` | 修正 | `HeartbeatConfig` に `desktopNotification` 追加 |
| `src/core/config.ts` | 修正 | デフォルト値追加、既存データのフォールバック |
| `src/core/notifier.ts` | 新規 | Notification API ラッパー |
| `src/hooks/useHeartbeat.ts` | 修正 | 通知リスナー追加、Visibility API 改善 |
| `src/components/SettingsModal.tsx` | 修正 | 通知トグル UI |
| `src/index.css` | 修正 | 通知設定のスタイル |
| `src/core/notifier.test.ts` | 新規 | notifier のテスト |
| `src/core/config.test.ts` | 修正 | `desktopNotification` テスト追加 |
