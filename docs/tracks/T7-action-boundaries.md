# T7 行動実行の境界設計

## 目的

提案だけでなく、どこまで実行させるかを安全に定義する。

## 現在地

- Action Planning により設定変更までは自動実行できる
- ただし advisory mode / action mode の切り分けは曖昧

## 具体タスク

### Now

- 実行可能な操作を分類する
  - read
  - suggest
  - prepare
  - execute
- confirmation 必須 / 不要の判定基準を決める
- 既存の自動設定変更を action boundary 上で位置づける
- MCP / Web / OS 連携の権限境界を一覧化する

### Next

- action mode を feature flag / permission model と紐づける
- rollback 不可能な操作を明示的に分離する
- 実行前 explanation と実行後 audit log を接続する
- 自動実行の対象を安全な低リスク操作に限定する

### Later

- OS 連携や外部サービス連携を前提に action taxonomy を拡張する
- ユーザー単位で action autonomy のレベル調整を可能にする

## 成果判定

- 何が自動で実行され、何が提案止まりか説明できる
- 新しい action を追加しても安全境界が崩れない
- confirmation policy が UX と整合する

## 関連

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [../PROPOSAL-external-integration.md](../PROPOSAL-external-integration.md)
