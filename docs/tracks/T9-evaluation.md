# T9 研究評価設計

## 目的

「便利」ではなく「常用デバイス上の自律型エージェントとして成立しているか」を測る。

## 現在地

- KPI / SLO / interview ループはある
- scenario evaluation template はある
- `init-week` で代表シナリオの雛形を生成できる
- `sync-scenarios` で weekly review の `シナリオ評価` を更新できる
- PoC exit criteria 文書を source of truth として追加した
- `sync-exit-criteria` で weekly review の `Exit Criteria 状態` を更新できる
- ただし、生活シナリオ単位の longitudinal な比較軸はまだ弱い

## 具体タスク

### Now

- 評価単位を feature ではなく生活シナリオへ移す
- ペルソナごとの代表シナリオを固定する
- 定量 / 定性 / 観測ログの 3 層をどう結び付けるか決める
- 「端末上エージェントらしさ」を評価する設問を定義する
- weekly で暫定 `Go / Extend / Reset` を残す

## Issue 粒度の分解

### T9-1 シナリオ評価テンプレート

- 出力:
  - 生活シナリオ単位の評価テンプレート
- 完了条件:
  - KPI / interview / logs を 1 シナリオに結び付けて記録できる
- 成果物:
  - [T9-scenario-evaluation-template.md](T9-scenario-evaluation-template.md)

### T9-2 PoC Exit Criteria

- 出力:
  - PoC を `Go / Extend / Reset` で判断する source of truth
- 完了条件:
  - KPI / SLO / interview / scenario を同じ基準で見られる
  - weekly review で暫定判定を残せる
- 成果物:
  - [../POC-EXIT-CRITERIA.md](../POC-EXIT-CRITERIA.md)

### Next

- longitudinal dogfooding の記録フォーマットを作る
- weekly に「今週どのシナリオを検証したか」と暫定 exit 判定を残す
- intervention / trust / autonomy を別々に評価できるようにする
- scenario を横断した milestone review の型を作る

### Later

- 端末種別・利用文脈別の比較評価を設計する
- 研究報告用のサマリー形式を整える

## 成果判定

- KPI と定性の矛盾を説明できる
- 生活シナリオ単位で「成立 / 非成立」を言える
- 次フェーズへ進む判断基準が明文化される

## 関連

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [../POC-KPI.md](../POC-KPI.md)
- [../POC-USER-VALIDATION.md](../POC-USER-VALIDATION.md)
- [../POC-SLO.md](../POC-SLO.md)
- [../POC-EXIT-CRITERIA.md](../POC-EXIT-CRITERIA.md)
