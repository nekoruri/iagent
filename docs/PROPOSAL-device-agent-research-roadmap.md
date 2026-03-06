# PROPOSAL: 常用デバイス上の自律型AIエージェント研究ロードマップ

> 作成日: 2026-03-07
> ミッション: **スマホなど常用しているデバイス上で動く自律型AIエージェントとしての可能性を探索する**
> 関連: [ROADMAP.md](ROADMAP.md) / [POC-KPI.md](POC-KPI.md) / [POC-USER-VALIDATION.md](POC-USER-VALIDATION.md) / [POC-SLO.md](POC-SLO.md) / [tracks/README.md](tracks/README.md) / [tracks/BACKLOG.md](tracks/BACKLOG.md)

---

## 1. この文書の目的

既存の proposal 群は機能・実装単位の整理が中心である。  
本ドキュメントはそれらの上位にある**研究ミッション**を明文化し、長期タスクを

- 常用デバイス
- 自律性
- 日常への埋め込み

の 3 軸で再整理するための方針文書である。

---

## 2. ミッションの再定義

iAgent の PoC は「役立つ提案を出せるか」だけを問うものではない。  
より本質的には、**ユーザーが常に持ち歩く端末の上で、自律型AIエージェントがどこまで成立するか**を探索する。

このミッションに含まれる問いは次の 5 つである。

1. 開いていない時間も含めて、端末上でエージェントは生き続けられるか
2. 常用デバイスだから得られる文脈を、提案や行動に変換できるか
3. 日常の邪魔をせず、介入すべき瞬間だけ介入できるか
4. ユーザーが怖がらずに任せられるか
5. 「便利なチャット」ではなく「端末上の半自律的な主体」に近づけるか

---

## 3. 成功の見方

この研究では、成功を単一 KPI だけで測らない。  
見るべきものは次の 4 層である。

### 3.1 価値の再現性

- 役立つ提案が複数ペルソナで再現するか
- 介入の価値が時間帯・場面をまたいで成立するか
- 長期利用で「賢くなった」と認知されるか

### 3.2 運用可能性

- Push / background 実行 / permission 変動 / battery 制約の中で維持できるか
- コスト、ログ、障害時の振る舞いを制御できるか
- 毎週の観測と改善サイクルを回し続けられるか

### 3.3 観測可能性

- 自律実行のトリガー、判断、結果、ユーザー反応を一連で観測できるか
- foreground / worker / service worker / push の各レイヤーを横断して追跡できるか
- ユーザー向けの説明ログと、開発者向けの解析ログを分けて扱えるか

### 3.4 端末上エージェントらしさ

- 文脈に応じて出方が変わるか
- 行動の説明可能性があるか
- ユーザーが「この端末上にいる存在」として認識できるか

---

## 4. 長期研究トラック

長期タスクは次の 9 本に整理する。

### T1. 自律実行基盤

目的: 端末上で「生き続ける」ための実行基盤を確立する。

主なタスク:

- foreground / background / closed の capability matrix 作成
- Push / Periodic Sync / Declarative Push の適用条件比較
- battery / network / permission 変動時の degradation policy
- wake-up 失敗時の fallback と再試行戦略

### T2. 常用デバイス文脈の取得

目的: 持ち歩く端末ならではの文脈を使えるようにする。

主なタスク:

- 時刻・場所・移動・静止・オンライン状態・集中状態のモデル化
- カレンダー、通知、クリップ、音声、カメラ、共有シートの入口統合
- coarse-grained な場面推定（仕事中 / 移動中 / 学習中 / 休息中）
- 最小権限での文脈取得設計

### T3. 介入設計

目的: 「何をするか」より「いつどう出るか」を最適化する。

主なタスク:

- silent log / badge / digest / notification / opened detail の介入階層化
- 通知から開いた後の landing 統一
- 出ないほうがよい条件の first-class 化
- 一日の介入密度制御

### T4. オブザーバビリティ基盤

目的: 端末上自律エージェントの実行と学習を、あとから理解・改善できる状態にする。

主なタスク:

- 自律実行イベントの標準スキーマ化
  - trigger
  - context
  - decision
  - delivery
  - user reaction
- foreground / worker / service worker / push を跨ぐ trace 連結
- ローカル保存と外部 export の二層観測
- ユーザー向け説明ログと開発者向け解析ログの分離
- 「何が起きたか」だけでなく「なぜその判断になったか」を追える観測設計

### T5. 信頼・安全・可視化

目的: 端末上の自律主体として任せられる状態を作る。

主なタスク:

- 「なぜ今これを出したか」の説明可能性
- 自動実行ログの標準化
- permission / 停止理由 / 動作状態の可視化
- least privilege preset と kill switch の強化

### T6. 学習とパーソナライズ

目的: 固定ルール通知から脱却し、端末上のエージェントらしさを育てる。

主なタスク:

- feedback から timing / channel / wording を学習
- memory 品質管理（誤記憶・stale・重複の抑制）
- goal / routine / preference / stale 状態のモデル整理
- ユーザーが監査できる学習結果の提示

### T7. 行動実行の境界設計

目的: 提案だけでなく、どこまで実行させるかを定義する。

主なタスク:

- advisory mode と action mode の分離
- 自動実行可能な操作範囲の定義
- confirmation 必須 / 不要操作の分類
- MCP / Web / OS 連携の境界定義

### T8. 端末制約最適化

目的: 常用デバイス上で無理なく存続できる形にする。

主なタスク:

- battery budget
- token budget
- latency budget
- storage budget
- offline / flaky network 耐性

### T9. 研究評価設計

目的: 「便利」ではなく「端末上自律エージェントとして成立しているか」を測る。

主なタスク:

- 生活シナリオ単位の評価設計
- longitudinal dogfooding
- 介入の文脈適合性評価
- 「任せられ感」「邪魔でなさ」「先回り感」の定性評価

---

## 5. 優先順位

ミッションから逆算した優先順は次の通り。

1. T1 自律実行基盤
2. T2 常用デバイス文脈の取得
3. T3 介入設計
4. T4 オブザーバビリティ基盤
5. T5 信頼・安全・可視化
6. T6 学習とパーソナライズ
7. T7 行動実行の境界設計
8. T8 端末制約最適化
9. T9 研究評価設計

理由:

- 端末上で生き続けられなければ自律型エージェントとして成立しない
- 文脈がなければ「常用デバイス上にいる意味」がない
- 介入設計がなければ日常に埋め込めない
- 観測できなければ、自律主体としての振る舞いを改善も説明もできない

---

## 6. 既存 proposal との対応

| 研究トラック | 既存 proposal / docs |
|---|---|
| T1 自律実行基盤 | [PROPOSAL-mobile-enhancement.md](PROPOSAL-mobile-enhancement.md), [NOTE-declarative-web-push-2026-03.md](NOTE-declarative-web-push-2026-03.md), [OPERATIONS.md](OPERATIONS.md) |
| T2 常用デバイス文脈の取得 | [PROPOSAL-proactive-engine.md](PROPOSAL-proactive-engine.md), [USER-GUIDE.md](USER-GUIDE.md) |
| T3 介入設計 | [PROPOSAL-proactive-engine.md](PROPOSAL-proactive-engine.md), [POC-KPI.md](POC-KPI.md) |
| T4 オブザーバビリティ基盤 | [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md), [POC-SLO.md](POC-SLO.md) |
| T5 信頼・安全・可視化 | [MEMO-poc-focus-1-10.md](MEMO-poc-focus-1-10.md), [REVIEW-TRACKER.md](REVIEW-TRACKER.md) |
| T6 学習とパーソナライズ | [PROPOSAL-autonomous-agent-evolution.md](PROPOSAL-autonomous-agent-evolution.md) |
| T7 行動実行の境界設計 | [PROPOSAL-external-integration.md](PROPOSAL-external-integration.md) |
| T8 端末制約最適化 | [POC-SLO.md](POC-SLO.md), [OPERATIONS.md](OPERATIONS.md) |
| T9 研究評価設計 | [POC-USER-VALIDATION.md](POC-USER-VALIDATION.md), [POC-KPI.md](POC-KPI.md) |

---

## 7. 今後の使い方

この文書は feature backlog を直接増やすためのものではない。  
以後の proposal や roadmap 更新は、まず次を問う。

1. それは T1〜T9 のどこに属するか
2. 「常用デバイス上の自律主体」というミッションにどう効くか
3. 価値の再現性 / 運用可能性 / 観測可能性 / 端末上エージェントらしさのどれを前進させるか

この 3 問に答えられないタスクは、PoC の長期軸ではなく周辺改善として扱う。

具体タスクへの分解は [tracks/README.md](tracks/README.md) を参照。
