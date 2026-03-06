# T5 信頼・安全・可視化

## 目的

端末上の自律主体として、ユーザーが怖がらずに任せられる状態を作る。

## 現在地

- least privilege preset、focus mode、permission recovery、action log はある
- ただし trust model と停止理由の伝え方はまだ散らばっている

## 具体タスク

### Now

- 自律主体としての trust model を文章化する
- permission / stop reason / disabled reason の表示を統一する
- least privilege preset と kill switch の責務を整理する
- 行動の説明可能性を UI 上でどこまで出すかを決める

## Issue 粒度の分解

### T5-1 trust model v1

- 出力:
  - trust 原則
  - trust zone
  - stop / override 手段
- 完了条件:
  - 「何を任せ、何を任せないか」を 1 枚で説明できる
- 成果物:
  - [T5-trust-model.md](T5-trust-model.md)

### Next

- explanation UI と action log UI を接続する
- ユーザーが「何が無効・停止中か」を 1 画面で把握できるようにする
- permission 変化や自動停止の理由を event schema に含める
- privacy / security 上の制約を user-facing にまとめる

### Later

- trust regression を検出する定性評価テンプレートを整える
- 重要操作に対する consent / confirmation policy を再設計する

## 成果判定

- ユーザーが止め方と状態確認方法を理解できる
- 自律動作の抑制・停止が surprise にならない
- 安全策が UX を壊さずに見える

## 関連

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [../MEMO-poc-focus-1-10.md](../MEMO-poc-focus-1-10.md)
- [../REVIEW-TRACKER.md](../REVIEW-TRACKER.md)
