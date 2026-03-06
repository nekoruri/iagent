# T1 自律実行基盤

## 目的

常用デバイス上で、foreground / background / closed の各状態でも「生き続ける」自律実行基盤を作る。

## 現在地

- Heartbeat 3 層構成は実装済み
- Push / Periodic Sync / Worker / main thread の実行経路はある
- ただし、端末・ブラウザ・権限状態ごとの capability matrix はまだ固定されていない

## 具体タスク

### Now

- iOS / Android / Desktop の capability matrix を文書化する
- wake-up 経路ごとの state machine を整理する
- permission / offline / focusMode / quietHours を含む degradation policy を明文化する
- Push / Periodic Sync / foreground の失敗時 fallback 優先順位を固定する
- wake-up 経路別の回帰テスト一覧を整備する

## Issue 粒度の分解

### T1-1 capability matrix 文書化

- 出力:
  - browser / device / install state / permission state ごとの matrix
  - `できる / できない / 条件付き` の 3 段階表
- 完了条件:
  - `OPERATIONS` と `USER-GUIDE` に矛盾がない
  - iOS / Android / Desktop の差分を 1 枚で説明できる
- 成果物:
  - [T1-capability-matrix.md](T1-capability-matrix.md)

### T1-2 wake-up state machine 整理

- 出力:
  - foreground / worker / push / periodic-sync の state machine
  - 二重実行回避ポイント
- 完了条件:
  - trigger ごとの遷移図がある
  - fallback 優先順位と abort 条件が明記される

### T1-3 degradation policy 明文化

- 出力:
  - permission / offline / focusMode / quietHours / missing API key 時の挙動表
- 完了条件:
  - 「この条件だと何が止まり、何が残るか」が説明できる

### T1-4 runtime 回帰テスト一覧

- 出力:
  - main / worker / sw / push 経路ごとの test inventory
- 完了条件:
  - どの failure path が自動テスト済みで、どれが手動か一目で分かる

### Next

- capability matrix を UI 内の説明と同期する
- wake-up failure reason を標準イベントとして記録する
- foreground / worker / push の重複実行回避ロジックを観測可能にする
- 端末別の「どこまで自律実行できるか」を user-facing に表示する

### Later

- Declarative Web Push の再検討条件を満たしたら比較 PoC を実施する
- closed-state 実行保証の改善余地を、ブラウザ別に継続評価する

## 成果判定

- capability matrix が docs / UI / test で矛盾しない
- wake-up failure が再現・分類可能
- 新しい自律経路追加時に fallback ルールへ自然に組み込める

## 関連

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [../PROPOSAL-mobile-enhancement.md](../PROPOSAL-mobile-enhancement.md)
- [../NOTE-declarative-web-push-2026-03.md](../NOTE-declarative-web-push-2026-03.md)
- [../OPERATIONS.md](../OPERATIONS.md)
