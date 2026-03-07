# T4 オブザーバビリティ基盤

## 目的

端末上自律エージェントの実行と学習を、あとから理解・改善できる状態にする。

## 現在地

- OTel 互換 tracer、IndexedDB traces、OTLP export はある
- `flowId` / `stage` / `contextSnapshotId` の基礎イベントは実装済み
- `autonomy-stage` で `trigger/context` を残せるようになった
- Settings のオブザーバビリティで recent autonomy flows を確認できるようになった
- `traceId` がある flow から developer-facing trace detail を開ける
- Heartbeat パネルでは同じ flow を user-facing explanation として折りたたみ表示できる
- Feed パネルでも latest feed-related flow を user-facing explanation として折りたたみ表示できる
- chat 内の Heartbeat proactive message でも explanation card を折りたたみ表示できる
- 通知本文にも context 由来の短い explanation を入れられるが、重要タスクのみに限定している
- ただし、自律実行の trigger / decision / delivery / reaction を完全に埋め切れてはいない
- user-facing explanation log と developer-facing trace もまだ分離途上

## 具体タスク

### Now

- 自律実行イベントの標準スキーマを定義する
  - trigger
  - context
  - decision
  - delivery
  - user reaction
- foreground / worker / service worker / push を跨ぐ trace correlation 方針を決める
- ops-events / traces / weekly metrics の役割分担を固定する
- user-facing explanation log と developer-facing trace の境界を定義する

## Issue 粒度の分解

### T4-1 autonomy event schema v1

- 出力:
  - trigger / context / decision / delivery / user reaction を含む schema
- 完了条件:
  - Heartbeat / notification / suggestion に共通利用できる
- 成果物:
  - [T4-autonomy-event-schema.md](T4-autonomy-event-schema.md)

### T4-2 trace correlation 方針

- 出力:
  - foreground / worker / sw / push を跨ぐ相関キー設計
- 完了条件:
  - 1 つの自律実行 flow を横断で追える

### T4-3 logs の責務分離

- 出力:
  - `ops-events`
  - `traces`
  - `weekly metrics`
  の役割定義
- 完了条件:
  - 何をどこに残すかで迷わない

### T4-4 user log / dev trace 分離

- 出力:
  - ユーザー向け explanation log
  - 開発者向け diagnostics / trace
  の境界定義
- 完了条件:
  - trust UI と debugging UI が混線しない

### Next

- trigger から reaction まで 1 つの flow として検索できるようにする
- notification / heartbeat / suggestion のイベント schema を揃える
- diagnostics UI で現在の動作状態と直近の自律実行履歴を確認できるようにする
- export 先がない環境でも local-only で解析可能な導線を整える

### Later

- 介入設計や学習トラックと接続し、施策比較に使える観測基盤へ広げる
- 研究用ログと本番運用ログを分けて扱うルールを整える

## 成果判定

- 「なぜ今これが起きたか」を trace で追える
- 週次レビューと低レベルログが繋がる
- 開発者とユーザーで見るべきログが混線しない

## 関連

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../POC-SLO.md](../POC-SLO.md)
- [../ROADMAP.md](../ROADMAP.md)
