# T4 Autonomy Event Schema v1

> 作成日: 2026-03-07
> 目的: 自律実行を `trigger -> context -> decision -> delivery -> reaction` の流れで観測できるようにする
> 関連: [T4-observability.md](T4-observability.md) / [../ARCHITECTURE.md](../ARCHITECTURE.md) / [../POC-SLO.md](../POC-SLO.md)

---

## 1. この文書の位置づけ

現在の iAgent には

- `ops-events`
- `traces`
- `weekly metrics`
- `action-log`

があるが、それぞれの責務と接続がまだ弱い。  
この文書は、自律実行を追うための最小 schema を定義する。

---

## 2. current primitives

### 2.1 ops-events

現行 `ops-events` は次を記録している。

- `autonomy-stage`
- `notification-shown`
- `notification-clicked`
- `heartbeat-run`
- `heartbeat-feedback`
- `setup-wizard`

current implementation の補足:

- `autonomy-stage` は `trigger/context` に加えて、suppression/no-change の `delivery` も記録する
- `notification-shown` / `notification-clicked` には `stage=delivery/reaction` を付けている

性質:

- 軽量
- KPI/SLO 集計向き
- flow 全体の相関はまだ弱い

### 2.2 traces

現行 traces は OTel 互換で、

- chat 実行
- tool span
- heartbeat 実行

を残す。

性質:

- 詳細な timing / token usage 向き
- 開発者向け
- user-facing ではない

### 2.3 weekly metrics

KPI / SLO / interview の集約結果。

性質:

- 意思決定向き
- 個々の flow ではなく週次の学びを扱う

---

## 3. event flow の基本単位

自律実行は次の 5 段階で観測する。

1. `trigger`
2. `context`
3. `decision`
4. `delivery`
5. `reaction`

各段階の意味:

| 段階 | 意味 |
|---|---|
| `trigger` | 何が実行開始のきっかけになったか |
| `context` | その時の端末・場面・制約は何か |
| `decision` | 何を出す / 出さないと判断したか |
| `delivery` | どの channel / level で出したか |
| `reaction` | ユーザーがどう反応したか |

---

## 4. schema v1

最小 schema は次の通り。

| フィールド | 説明 |
|---|---|
| `eventId` | 単一イベントID |
| `flowId` | 1 回の自律実行 flow を束ねるID |
| `stage` | `trigger` / `context` / `decision` / `delivery` / `reaction` |
| `timestamp` | 発生時刻 |
| `source` | `tab` / `worker` / `push` / `periodic-sync` / `chat` |
| `taskId` | 対象 task |
| `channel` | `desktop` / `push` / `badge` / `panel` / `digest` / `chat` |
| `interventionLevel` | `L0` / `L1` / `L2` / `L3` / `L4` |
| `result` | `success` / `failure` / `skipped` / `accepted` / `dismissed` / `snoozed` |
| `reason` | suppression / skip / failure の理由 |
| `contextSnapshotId` | 端末文脈 snapshot 参照 |
| `traceId` | 詳細 trace への参照 |

current reason vocabulary の例:

- `quiet_hours`
- `focus_mode`
- `daily_quota_reached`
- `offline`
- `no_api_key`
- `no_due_tasks`
- `token_budget_exceeded`
- `token_budget_deferred`
- `no_changes`
- `notification_permission_denied`
- `network_error`
- `latency_timeout`

---

## 5. 役割分担

### ops-events に残すもの

- `trigger`
- `context`
- `delivery`
- `reaction`
- `heartbeat-run` の結果サマリ
- suppression / skip / failure の reason
- token に加えて network / latency の budget reason

### traces に残すもの

- token usage
- tool span
- detailed timing
- internal execution detail

### weekly metrics に残すもの

- KPI / SLO 集約
- interview との統合結果
- 次週アクション

---

## 6. flow correlation 方針

### v1 方針

- `flowId` を自律実行 1 回ごとに発行する
- `heartbeat-run` と、それに紐づく `notification-shown` / `notification-clicked` / `heartbeat-feedback` を同一 `flowId` で束ねる
- 詳細 trace がある場合は `traceId` を flow にぶら下げる

### current gap

- 現在は `notificationId` / `notificationTag` / `taskId` / `timestamp` が部分的な相関キーになっている
- 今後はこれを `flowId` に寄せる

---

## 7. user log / dev trace の境界

### user-facing explanation log

ユーザーに見せるべきもの:

- 何が起きたか
- なぜ止まったか
- なぜ今これが出たか
- 次に何をすればよいか

### developer-facing diagnostics / trace

開発者が見るべきもの:

- tool span
- token usage
- network / push / worker failure
- retry / fallback detail

current implementation:

- Settings の `オブザーバビリティ` で recent autonomy flows を一覧表示
- `traceId` がある flow は `trace を表示` で root span / spans / events / attributes を開ける
- Heartbeat パネルでは `flowId` に紐づく explanation を折りたたみで `なぜ今` として表示する
- Feed パネルでも latest feed-related flow を折りたたみで `なぜ今` として表示する
- chat 内の Heartbeat proactive message にも explanation card を折りたたみで表示する
- 通知本文には context snapshot 由来の短い explanation を表示するが、重要タスクのみに限定する

この 2 つを混ぜない。  
同じ flow を参照していても、見せる粒度は分離する。

---

## 8. v1 で先に決めること

1. `flowId` の生成単位
2. `stage` の語彙
3. `interventionLevel` と taxonomy の対応
4. `reason` の標準語彙
5. `ops-events` に寄せるものと `traces` に寄せるものの境界

---

## 9. 完了条件

- 1 つの自律実行について、`trigger -> reaction` まで追跡できる
- weekly review から必要時に raw event / trace へ降りられる
- user-facing explanation と developer trace の責務が分離されている
