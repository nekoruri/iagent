# T8 端末制約最適化

## 目的

常用デバイス上で無理なく存続できるよう、各種 budget と制約を扱う。

## 現在地

- token budget、storage persistence、offline fallback はある
- Settings の Heartbeat セクションで `デバイス budget サマリー` を確認できる
- ただし battery / latency / storage / network の統合 budget 設計はまだ弱い

## 具体タスク

### Now

- device-side budget を一覧化する
  - battery
  - token
  - latency
  - storage
  - network
- 各 budget の観測点と fallback 動作を決める
- 「どの budget が効いて止まったか」をログに残せるようにする
- offline / flaky network での degrade policy を明文化する

## Issue 粒度の分解

### T8-1 device-side budget inventory

- 出力:
  - battery / token / latency / storage / network の一覧
- 完了条件:
  - 各 budget に current fallback が紐づく
- 成果物:
  - [T8-budget-inventory.md](T8-budget-inventory.md)

### Next

- budget 逼迫時の優先順位を整理する
- 端末制約に応じて wake-up / suggestion / sync の頻度を調整する
- storage GC と cache policy の方針を揃える
- battery-friendly な自律実行条件を検証する

### Later

- device segment ごとに budget policy を最適化する
- budget を user-facing 設定にどこまで露出するかを再評価する

## 成果判定

- 制約下でも破綻せずに動く
- どの制約で degrade したか説明できる
- 端末に優しい設計が運用ログでも確認できる

## 関連

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [../POC-SLO.md](../POC-SLO.md)
- [../OPERATIONS.md](../OPERATIONS.md)
