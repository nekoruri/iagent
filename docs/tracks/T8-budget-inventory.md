# T8 Device-side Budget Inventory v1

> 作成日: 2026-03-07
> 目的: 常用デバイス上で自律エージェントが消費する主要 budget を一覧化し、degrade policy と結びつける
> 関連: [T8-device-constraints.md](T8-device-constraints.md) / [../POC-SLO.md](../POC-SLO.md) / [../OPERATIONS.md](../OPERATIONS.md)

---

## 1. この文書の位置づけ

自律型エージェントは、端末上で無限に動けるわけではない。  
この inventory は、iAgent が依存する主要 budget をまとめたものです。

ここで扱う budget:

- battery
- token
- latency
- storage
- network

---

## 2. budget inventory

| budget | 現在の主観測点 | 主な制約源 | 既存 fallback |
|---|---|---|---|
| `battery` | 間接的（端末依存） | background 制約、OS、wake-up 制限 | Push 優先、Periodic Sync 補助 |
| `token` | `heartbeat-run` ops-event の token usage | OpenAI API コスト、task complexity | cost control, degraded mode, deferNonCriticalTasks |
| `latency` | Heartbeat duration p95 | network、tool call、LLM 応答 | timeout, task grouping, skip/no due |
| `storage` | IndexedDB usage / persistence state | browser quota, iOS eviction | storage persist, archive, cleanup |
| `network` | `navigator.onLine`, proxy errors, push server reachability | offline, flaky network, upstream timeout | offline banner, URL validation, retry / skip |

---

## 3. budget ごとの current policy

### 3.1 battery

現状:

- 明示的な battery budget は持っていない
- 実際には browser / OS が background 実行を制約することで battery を守っている

current policy:

- wake-up は Push を優先
- Periodic Sync は補助
- iOS では PWA install を前提に closed-state path を絞る

### 3.2 token

現状:

- `heartbeatCost.ts` に日次 token budget と pressure threshold がある
- task ごとに model / maxCompletionTokens を変えている

current policy:

- budget 超過時は skip
- pressure 時は degraded mode
- 非クリティカル task は defer

### 3.3 latency

現状:

- `heartbeat-run.durationMs`
- SLO の p95
- fetch timeout

current policy:

- 90 秒 timeout
- no due tasks は即 skip
- task grouping で request 数を抑える

### 3.4 storage

現状:

- IndexedDB usage / quota 表示
- `navigator.storage.persist()`
- archive / cleanup / portability

current policy:

- persist を起動時に要求
- memory は archive へ逃がす
- attachments は Blob 優先

### 3.5 network

現状:

- offline banner
- proxy timeout
- push server / upstream fetch error handling

current policy:

- offline では送信停止
- proxy / push / fetch はエラー時に safe に失敗
- background path が死んでも foreground path を壊さない

---

## 4. budget -> degrade mapping

| 逼迫 budget | degrade の基本方針 |
|---|---|
| `battery` | wake-up 経路を減らす、foreground へ寄せる |
| `token` | model downgrade、output 短縮、task defer |
| `latency` | timeout、request grouping、non-critical skip |
| `storage` | archive / cleanup / export 導線 |
| `network` | offline fallback、error log、retry を限定 |

---

## 5. observability で残すべきもの

budget inventory を運用に活かすには、少なくとも次を記録したい。

| budget | 記録すべきもの |
|---|---|
| `battery` | background path が使えなかった理由 |
| `token` | used / budget / pressure / degraded |
| `latency` | duration, timeout, skipped reason |
| `storage` | persistent state, quota, archive activity |
| `network` | offline/online state, proxy error, push error |

---

## 6. v1 完了条件

- budget の一覧が 1 枚にまとまる
- 各 budget に current fallback が紐づく
- observability で何を残すべきかが明確になる

current implementation:

- Settings の Heartbeat セクションで `デバイス budget サマリー` を表示
- `battery / token / latency / storage / network` を `ok / watch / limited` で確認可能
