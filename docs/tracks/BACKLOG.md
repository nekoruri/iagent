# 長期トラック横断バックログ

長期研究トラック `T1〜T9` を横断して、**今どこから着手するとミッションに最も効くか**で並べたバックログです。

上位方針:

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [README.md](README.md)

---

## P0: まず固める

### P0-1. 常用デバイス capability matrix を固定する

- トラック: `T1`
- 目的: 端末 / ブラウザ / foreground / background / closed の境界を曖昧なままにしない
- 成果物:
  - capability matrix 文書
  - UI 説明の差分一覧
  - テスト対象一覧

### P0-2. 介入レベル taxonomy を固定する

- トラック: `T3`
- 目的: notification / badge / digest / silent log の使い分けを明確化する
- 成果物:
  - intervention taxonomy
  - landing UX の基本パターン
  - suppression rule 草案

### P0-3. 自律実行イベントの標準スキーマを作る

- トラック: `T4`
- 目的: trigger -> decision -> delivery -> reaction を一連で観測できるようにする
- 成果物:
  - event schema v1
  - ops-events / traces / weekly metrics の役割分担
  - correlation key 方針

### P0-4. device context snapshot の最小形を決める

- トラック: `T2`
- 目的: 「今どの場面か」を最低限の文脈で表現できるようにする
- 成果物:
  - context snapshot schema v1
  - coarse-grained 場面分類
  - 利用シグナル一覧

---

## P1: 自律主体として成立させる

### P1-1. trust model を文章化する

- トラック: `T5`
- 目的: 何を任せ、何を任せないかの説明軸を作る
- 成果物:
  - trust model 文書
  - stop / disable / focus / least privilege の責務表

### P1-2. device-side budget inventory を整理する

- トラック: `T8`
- 目的: battery / token / latency / storage / network の制約を同じ table で扱う
- 成果物:
  - budget inventory
  - degrade policy 対応表

### P1-3. 生活シナリオ評価のテンプレートを作る

- トラック: `T9`
- 目的: feature 単位ではなく生活文脈単位で評価する
- 成果物:
  - シナリオ評価テンプレート
  - ペルソナ別代表シナリオ

### P1-4. PoC exit criteria を固定する

- トラック: `T9`
- 目的: KPI / SLO / interview / scenario を go / extend / reset の判断に束ねる
- 成果物:
  - exit criteria 文書
  - weekly review の暫定判定ルール
  - hard fail signal 一覧

---

## P2: 学習と行動の境界を詰める

### P2-1. 学習対象の棚卸し

- トラック: `T6`
- 目的: timing / channel / wording / ranking のどこを学習するか明示する

### P2-2. action boundary の taxonomy 化

- トラック: `T7`
- 目的: suggest / prepare / execute の境界と confirmation policy を固定する

### P2-3. agent artifact model の最小形を作る

- トラック: `T4 / T6 / T7`
- 目的: capability / policy / skill / eval / outcome を runtime から分離した共有資産として扱えるようにする
- 成果物:
  - artifact model の最小構成
  - trust level と promotion flow の定義
  - policy contract と action boundary の接続方針

---

## 推奨順

1. `P0-1` capability matrix
2. `P0-2` intervention taxonomy
3. `P0-3` observability schema
4. `P0-4` context snapshot
5. `P1-1` trust model
6. `P1-2` budget inventory
7. `P1-3` scenario evaluation template
8. `P1-4` PoC exit criteria
9. `P2-1` learning scope
10. `P2-2` action boundary
11. `P2-3` agent artifact model

この順番にしている理由:

- 実行条件、出方、観測が定まらないと、学習も trust も設計できない
- trust は observability と intervention taxonomy の上に乗る
- exit criteria は KPI / SLO / interview / scenario の接続が揃ってから固定する
- action boundary は context / trust / observability が揃ってからのほうが設計しやすい
- artifact model は observability / learning / action boundary の接続点なので、その 3 つの下地が見えてから詰める
