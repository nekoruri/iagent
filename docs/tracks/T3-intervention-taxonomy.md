# T3 Intervention Taxonomy v1

> 作成日: 2026-03-07
> 目的: iAgent の介入を「どこで / どの強さで / 何を期待して出すか」で共通言語化する
> 関連: [T3-intervention-design.md](T3-intervention-design.md) / [../USER-GUIDE.md](../USER-GUIDE.md) / [../POC-KPI.md](../POC-KPI.md)

---

## 1. この文書の位置づけ

この taxonomy は、現在の iAgent に存在する

- Heartbeat 結果
- unread badge
- panel
- digest タスク
- desktop / push notification

を同じ言葉で扱うための設計文書です。

ここでは「機能名」ではなく**介入の強さと役割**で分類します。

---

## 2. 介入レベル

| レベル | 名称 | 主な surface | ユーザーへの圧力 | 主用途 |
|---|---|---|---|---|
| L0 | `silent log` | ops-events / traces / action log | なし | 後から説明・解析するための記録 |
| L1 | `badge` | Heartbeat バッジ / Feed バッジ | 低 | 「何かある」ことだけを知らせる |
| L2 | `digest` | RSS ダイジェスト / 週次サマリー / 月次レビュー | 中 | 複数情報を圧縮してまとめる |
| L3 | `proactive notification` | desktop notification / push notification | 高 | その時点での注意喚起・再訪トリガー |
| L4 | `opened detail` | Heartbeat パネル / Feed パネル / 開いた後の詳細 UI | ユーザー主導 | 内容理解と次アクション判断 |

補足:

- `L2 digest` は内容の類型
- `L3 proactive notification` は delivery の強さ
- `L2` が `L3` を伴うことはある
- `L4` は通知クリック後やユーザー手動操作で到達する詳細面

---

## 3. 現行機能のマッピング

| 現行機能 | taxonomy 上の位置 | 備考 |
|---|---|---|
| `ops-events` | `L0 silent log` | 開発者向け観測 |
| `action-log` | `L0 silent log` | ユーザーにも見えるが、基本は説明ログ |
| Heartbeat 未読バッジ | `L1 badge` | 中身ではなく存在のみ知らせる |
| Feed 未読バッジ | `L1 badge` | 記事詳細は開くまで出さない |
| `rss-digest-daily` | `L2 digest` | digest content |
| `weekly-summary` | `L2 digest` | digest content |
| `monthly-review` | `L2 digest` | digest content |
| desktop notification | `L3 proactive notification` | foreground / background での再訪トリガー |
| push notification | `L3 proactive notification` | closed-state wake-up 後の再訪トリガー |
| Heartbeat パネル | `L4 opened detail` | 実行結果の第一詳細面 |
| Feed パネル | `L4 opened detail` | 情報収集系の第二詳細面 |

---

## 4. landing UX v1

notification click 後の current landing pattern は次です。

1. 通知クリックで app root (`/`) を開く、または既存タブへ focus を戻す
2. 結果そのものは `heartbeat` store に残っている
3. ユーザーはベルアイコンから Heartbeat パネルを開いて詳細を見る
4. 必要なら Feed パネルや chat に移動して次アクションへ進む

これは**deep link ではなく state retention 型**の landing です。

### landing UX v1 の意図

- 通知クリック時の routing 複雑化を避ける
- app root へ戻しても、結果自体は失われない
- 第一詳細面を Heartbeat パネルに統一する

### landging UX v1 の弱点

- 通知を開いた直後に「次に何をすればよいか」が即時には見えない
- deep link ではないため、結果への到達に 1 手かかる

---

## 5. suppression rule 初版

current implementation / current policy に基づく suppression rule は次です。

### 実行自体を止める

- `heartbeat.enabled = false`
- `focusMode = true`
- `quietHours` / `quietDays`
- API キー未設定
- due task なし

### delivery を止める

- `Notification.permission !== granted`
- Push 未購読
- Service Worker / PushManager 利用不可

### detail の露出を抑える

- `dismissed`: Heartbeat パネルから非表示
- `snoozed`: 期限まで Heartbeat パネルから非表示

### visible interrupt を避ける

- `hasChanges = false` の場合は proactive notification を出さない  
  補足:
  Chrome 系の push 経路では仕様都合で silent notification を一瞬出して閉じる内部挙動があるが、taxonomy 上は `L3 proactive notification` ではなく delivery workaround と扱う。

---

## 6. KPI / 観測との接続

taxonomy と KPI の関係は次です。

| 観点 | 主に見るレベル | 主指標 |
|---|---|---|
| 邪魔でないか | `L3` | 通知経由再訪率、dismiss / snooze 傾向 |
| 気づけるか | `L1` | unread badge からの開封行動 |
| 圧縮価値があるか | `L2` | digest 後の再訪・定性コメント |
| 次アクションに繋がるか | `L4` | 通知後行動、interview の Must/Should |

---

## 7. 今後の更新ルール

新しい介入を追加するときは、必ず次を決める。

1. `L0〜L4` のどこに属するか
2. trigger は何か
3. landing はどこか
4. suppression rule は何か
5. KPI / observability では何を見るか

この 5 点が決まらない限り、新しい介入は追加しない。
