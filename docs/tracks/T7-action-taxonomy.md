# T7 Action Taxonomy v1

> 作成日: 2026-03-07
> 目的: iAgent がどこまで実行し、どこから先は提案止まりかを 1 枚で説明できるようにする
> 関連: [T7-action-boundaries.md](T7-action-boundaries.md) / [T5-trust-model.md](T5-trust-model.md) / [../USER-GUIDE.md](../USER-GUIDE.md)

---

## 1. この文書の位置づけ

T7 は「何を自動で実行するか」を増やすためではなく、

- どこまで許可しているか
- 何に confirmation が要るか
- 何が未許可か
- どこで確認できるか

を固定するための文書です。

---

## 2. v1 の taxonomy

| レベル | 説明 | 現在の扱い | 確認 | 戻し方 |
|---|---|---|---|---|
| `read` | 参照のみ。副作用なし | 許可 | 不要 | 不要 |
| `suggest` | 通知 / panel / chat で提案する | 許可 | 不要 | dismiss / snooze / focus mode |
| `prepare` | ルール生成や reflection 保存など、可逆な下準備 | 許可 | 不要 | 上書き / archive / 再生成 |
| `execute (local)` | ローカル設定の自動変更 | 限定許可 | 事前確認なし（PoC） | 手動で戻す / Action log で追跡 |
| `execute (external)` | 外部副作用を伴う実行 | 未許可 | 必須 | 操作依存のため PoC では扱わない |

---

## 3. 現在の具体例

### 3.1 read

- `listCalendarEvents`
- `getCurrentTime`
- `listUnreadFeedItems`
- Heartbeat で許可された MCP read-only ツール

### 3.2 suggest

- Heartbeat notification
- Heartbeat panel
- FeedPanel の proactive explanation
- chat 内 proactive message

### 3.3 prepare

- `suggestion-optimization` による rule 生成
- reflection 保存
- pattern recognition

### 3.4 execute (local)

現時点で許可しているのは Action Planning の次だけ:

- `toggle-task`
- `update-quiet-hours`
- `update-quiet-days`
- `update-task-interval`

特徴:

- ローカル設定のみ
- 可逆
- Action log で追跡可能

### 3.5 execute (external)

PoC v1 では未許可。

例:

- メール送信
- 外部サービスの更新
- Issue / PR への書き込み
- カレンダーの自動作成 / 変更

---

## 4. confirmation policy

### confirmation 不要

- `read`
- `suggest`
- `prepare`
- `execute (local)` のうち既存 Action Planning 4 種

理由:

- ローカルで可逆
- audit log がある
- user override が常に上位にある

### confirmation 必須

- `execute (external)` 全般
- rollback 不可能、または影響範囲が不明な操作

---

## 5. UI 上の確認場所

- 設定 → `セキュリティ（PoC）` → `Action Boundary`
- 設定 → Heartbeat → `自動実行ログ（Action Planning）`

v1 で分かること:

- 現在の標準経路が `execute (local)` までであること
- `execute (external)` は未許可であること
- 各レベルの confirmation / rollback 方針

---

## 6. v1 完了条件

- taxonomy を 1 枚で説明できる
- docs と Settings で境界が一致している
- Action Planning が `execute (local)` であることを明示できる
