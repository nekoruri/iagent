# T6 学習とパーソナライズ

## 目的

固定ルール通知から脱却し、端末上で育つエージェントらしさを作る。

## 現在地

- feedback loop、pattern recognition、suggestion optimization はある
- memory 品質管理や stale 制御もある
- ただし、学習結果の見せ方と監査可能性はまだ弱い

## 具体タスク

### Now

- feedback から学習される項目を一覧化する
- timing / channel / wording の学習対象を明示する
- memory 品質管理と suggestion optimization の責務分離を整理する
- 学習結果をユーザーが確認できる summary の形式を決める

### Next

- 学習前後の差分を weekly で比較できるようにする
- 「この提案はどの学習結果に基づくか」を辿れるようにする
- stale / noisy / duplicate memory が提案に与える影響を可視化する
- 学習結果の rollback 方針を決める

### Later

- より高度な procedural memory / semantic retrieval の導入を再検討する
- user-segment ごとに学習ループの効き方を比較する

## 成果判定

- 「賢くなった」の根拠をログと定性の両方で説明できる
- 学習結果がブラックボックスにならない
- memory quality と提案品質の関係を追える

## 関連

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [../PROPOSAL-autonomous-agent-evolution.md](../PROPOSAL-autonomous-agent-evolution.md)
