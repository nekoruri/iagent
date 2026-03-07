# T3 介入設計

## 目的

「何をするか」より先に、「いつ・どこで・どの強さで出るか」を設計する。

## 現在地

- Heartbeat 通知、バッジ、パネル、chat suggestion が混在している
- 介入レベル taxonomy 文書は作成済み
- Heartbeat 通知から開いた後の landing は、パネル自動表示まで実装済み
- `quiet_hours / focus_mode / daily_quota_reached / offline / no_changes / notification permission` を suppression reason として flow 上に残せる
- ただし介入レベルの横断設計と suppression の運用はまだ固定しきれていない

## 具体タスク

### Now

- 介入レベルを定義する
  - silent log
  - badge
  - digest
  - proactive notification
  - opened detail
- 介入レベルごとの適用条件を決める
- 通知から開いた後の landing UX を 1 パターンに寄せる
- 「出ないほうがよい条件」を suppression rule として整理する

## Issue 粒度の分解

### T3-1 intervention taxonomy v1

- 出力:
  - silent log / badge / digest / proactive notification / opened detail の定義
- 完了条件:
  - 既存機能が taxonomy 上のどこに属するかマッピングされる
- 成果物:
  - [T3-intervention-taxonomy.md](T3-intervention-taxonomy.md)

### T3-2 landing UX 統一

- 出力:
  - notification click 後の基本導線
- 完了条件:
  - 「通知を開いたあと何をすればよいか分からない」を構造的に潰せる

### T3-3 suppression rule 初版

- 出力:
  - 出さない条件のルール集
- 完了条件:
  - quiet hours, focus mode, duplicate context, stale proposal の扱いが決まる

### T3-4 intervention density の観測軸

- 出力:
  - 一日あたり介入密度の定義
  - 週次で見る数値案
- 完了条件:
  - 「多い/少ない」を定量でも語れる

### Next

- 介入レベルを event schema に埋め込む
- suggestion / heartbeat / digest を同一 taxonomy で扱う
- daily intervention density の上限を可視化する
- notification click 後の行動率を level ごとに追えるようにする

### Later

- 場面ごとに介入レベルを切り替える適応制御を検討する
- digest と proactive notification の役割分担を長期利用で最適化する

## 成果判定

- どの介入が何の意図で出たか説明できる
- 同じ提案内容でも場面に応じて出方が変わる
- 「邪魔」コメントの原因を介入設計で説明できる

## 関連

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [../PROPOSAL-proactive-engine.md](../PROPOSAL-proactive-engine.md)
- [../POC-KPI.md](../POC-KPI.md)
