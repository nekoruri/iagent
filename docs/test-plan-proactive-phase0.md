# テストプラン: Phase 0 プロアクティブ提案エンジン基盤

## 概要

F5+ MVP（多段階 RSS フィルタリング）と F1（フィードバック UI）の手動テストプラン。

---

## 自動テスト

| テストファイル | 追加テスト数 | 内容 |
|---|---|---|
| `src/store/feedStore.test.ts` | +10 | listUnclassifiedItems / listClassifiedItems / updateItemTier |
| `src/core/heartbeatTools.test.ts` | +10 | listUnreadFeedItems / saveFeedClassification / listClassifiedFeedItems + WORKER_TOOLS length |
| `src/store/heartbeatStore.test.ts` | +10 | setHeartbeatFeedback / filterVisibleResults |
| `src/components/HeartbeatPanel.test.tsx` | +5 | フィードバックボタン表示 / Accept / Dismiss / accepted ラベル / Snooze メニュー |

### 実行方法

```bash
npx vitest run
```

---

## 手動テスト

### 前提条件

- `npm run dev` でローカル開発サーバーを起動
- OpenAI API Key が設定済み
- RSS フィードを 1 件以上購読済み（未読記事あり）
- Heartbeat 有効 + feed-check タスク有効

---

### F5+: 多段階 RSS フィルタリング

#### TC-01: feed-check がツールチェーンを正しく実行する

| 項目 | 内容 |
|---|---|
| **前提** | 未読記事が 5 件以上ある状態 |
| **手順** | 1. Heartbeat 間隔を短く設定（10分）<br>2. feed-check の実行を待つ、または DevTools Console で直接トリガー |
| **期待結果** | LLM が `fetchFeeds → listUnreadFeedItems → saveFeedClassification` の順にツールを呼ぶ |
| **確認方法** | DevTools Console のログ、または OTel トレースで tool_calls の順序を確認 |

#### TC-02: 分類結果が IndexedDB に保存される

| 項目 | 内容 |
|---|---|
| **前提** | TC-01 が完了した状態 |
| **手順** | DevTools → Application → IndexedDB → iagent → feed-items を開く |
| **期待結果** | 各アイテムに `tier`（must-read / recommended / skip）と `classifiedAt`（タイムスタンプ）が設定されている |

#### TC-03: briefing-morning が分類済み記事を参照する

| 項目 | 内容 |
|---|---|
| **前提** | TC-02 で分類済み記事がある状態、briefing-morning タスク有効 |
| **手順** | briefing-morning を実行（時刻設定を一時的に変更するか、DevTools で直接トリガー） |
| **期待結果** | ブリーフィング本文に must-read / recommended の記事タイトルが含まれる |
| **確認方法** | HeartbeatPanel のブリーフィング結果を確認 |

#### TC-04: 大量記事のバッチ処理

| 項目 | 内容 |
|---|---|
| **前提** | 未読記事が 60 件以上ある状態（複数フィード購読で蓄積） |
| **手順** | feed-check を実行 |
| **期待結果** | 30 件ずつ `listUnreadFeedItems` + `saveFeedClassification` が繰り返される |
| **注意** | MAX_TOOL_ROUNDS=5 のため、200件超では打ち切られる可能性あり。打ち切り時は次回実行で残りが分類される |

#### TC-05: excerpt の品質確認

| 項目 | 内容 |
|---|---|
| **手順** | DevTools Console で以下を実行して戻り値を確認:<br>1. `heartbeatTools.executeWorkerTool('listUnreadFeedItems', {})` の結果を確認 |
| **期待結果** | 1. HTML タグが除去されている<br>2. 100 文字以内に収まっている<br>3. 日本語の途中で切れていても壊れていない |

---

### F1: フィードバック UI

#### TC-06: フィードバックボタンの表示

| 項目 | 内容 |
|---|---|
| **前提** | HeartbeatPanel に結果が 1 件以上ある状態 |
| **手順** | ベルアイコンをクリックしてパネルを開く |
| **期待結果** | 各結果の下に ✓（Accept）/ ✕（Dismiss）/ ⏰（Snooze）ボタンが表示される |

#### TC-07: Accept 動作

| 項目 | 内容 |
|---|---|
| **手順** | 結果の ✓ ボタンをクリック |
| **期待結果** | 1. ボタン行が消え、「✓ 確認済み」ラベルに置き換わる<br>2. パネルを閉じて再度開いても「✓ 確認済み」のまま |

#### TC-08: Dismiss 動作

| 項目 | 内容 |
|---|---|
| **手順** | 結果の ✕ ボタンをクリック |
| **期待結果** | その結果が即座にパネルから消える |
| **確認方法** | パネルを閉じて再度開いても表示されないことを確認 |

#### TC-09: Snooze 動作（1時間後）

| 項目 | 内容 |
|---|---|
| **手順** | 1. ⏰ ボタンをクリック<br>2. サブメニューから「1時間後」を選択 |
| **期待結果** | 1. その結果がパネルから消える<br>2. 1 時間後にパネルを開くと再表示される |
| **簡易確認** | DevTools Console で `Date.now()` をオーバーライドするか、IndexedDB の `snoozedUntil` を過去の値に書き換えてパネルを再度開く |

#### TC-10: Snooze メニューの開閉

| 項目 | 内容 |
|---|---|
| **手順** | 1. ⏰ ボタンをクリック（メニュー表示）<br>2. メニュー外をクリック |
| **期待結果** | メニューが閉じる |

#### TC-11: Dismiss 済み結果の未読カウント

| 項目 | 内容 |
|---|---|
| **前提** | 未読結果が 3 件ある状態（バッジに「3」表示） |
| **手順** | 1 件を Dismiss する |
| **期待結果** | バッジの数字が減る（Dismiss した結果は未読カウントからも除外される） |

---

### モバイル固有

#### TC-12: フィードバックボタンのタップ領域（モバイル）

| 項目 | 内容 |
|---|---|
| **手順** | モバイル実機または DevTools のデバイスエミュレーションで確認 |
| **期待結果** | 1. ボタンが 44x44px で表示される<br>2. 隣のボタンを誤タップしない間隔がある |

#### TC-13: Snooze メニューの表示位置（モバイル）

| 項目 | 内容 |
|---|---|
| **手順** | モバイルのボトムシート表示時に、一番下の結果で Snooze メニューを開く |
| **期待結果** | メニューがボタンの上（ドロップアップ）に表示され、画面外にはみ出さない |

---

## 既知の制限事項

| 項目 | 内容 | 対応方針 |
|---|---|---|
| MAX_TOOL_ROUNDS=5 | 200件超の未分類記事がある場合、1回の feed-check で全件分類しきれない | 次回実行で残りを分類。必要に応じて上限引き上げ |
| gpt-5-nano の分類精度 | excerpt 100文字での分類が不正確な場合がある | 文字数調整、またはプロンプト改善で対応 |
| Snooze の再表示 | パネルを開いた瞬間の `Date.now()` で評価。能動的な Push 通知は Phase 0 対象外 | Phase 1 以降で検討 |
