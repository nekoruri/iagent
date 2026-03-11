# PROPOSAL: ドキュメント駆動 AI エージェント再実装アーキテクチャ

> 位置づけ: 長期探索向け proposal
> 関連: [ADR-exploration-first-technical-direction.md](ADR-exploration-first-technical-direction.md) / [PROPOSAL-device-agent-research-roadmap.md](PROPOSAL-device-agent-research-roadmap.md) / [PROPOSAL-autonomous-agent-evolution.md](PROPOSAL-autonomous-agent-evolution.md) / [PROPOSAL-external-integration.md](PROPOSAL-external-integration.md)

## 背景

現状は、個別機能が AI エージェント本体に直接実装されており、
新機能追加時に次の課題が出やすい。

- 仕様差分がコード差分に埋もれ、レビューで意図を追いにくい
- 機能横展開時に、再実装コストが高い
- ドメイン変更時に、同種の処理を複数箇所で修正する必要がある
- planner / executor / tool runtime を差し替えると、蓄積した手順や制約も一緒に作り直しやすい

このため、仕様を先行資産化し、LLM や runtime の入れ替わりに耐える
**agent の control plane / knowledge plane** を外出しする方向を整理する。

ここでいう「ドキュメント駆動」は、
単に YAML を増やすことではない。  
仕様、契約、スキル、評価例、実行履歴を
コード本体から切り離して持ち、複数の runtime がそれを読み替えられる状態を目指す。

---

## この提案の本質

この proposal は、既存コードを文書へ安全に写すだけの移行計画ではない。  
本質は、**エージェントの振る舞いを支える知識資産を first-class artifact にすること**にある。

これにより、将来的に次が可能になる。

- planner 主導の runtime と rule-first runtime を同じ資産で比較する
- human-authored skill と learned skill を同じ registry 上で扱う
- 安定した経路だけを playbook 化、compile 化する
- 実行結果や失敗から skill / policy / examples を更新し、次の方式へ持ち越す

したがって、長期の北極星は「安全な再実装」よりも
**差し替え可能な artifact の体系化**に置く。

---

## 目標

- 機能追加の主作業を「コード実装」から「artifact 拡張」へ寄せる
- 複数ユースケースへの横展開を、capability / skill / policy の再利用で実現する
- planner / executor / compiler を差し替えても、手順知識と制約を持ち越せるようにする
- human-authored skill と learned skill を同じ系で扱えるようにする
- 実行時の判断根拠を、参照した artifact バージョンに紐づけて追跡可能にする

非目標（初期段階）:

- 全機能の一括置換
- 単一 DSL への早期収束
- 完全自律な自己改変

---

## 共有する artifact model

この提案の中心は、1 つの YAML schema ではなく、
次の artifact を分離して扱うことにある。

### 1. Capability Contract

何ができるかを定義する契約。

- 入力 / 出力 schema
- 前提条件
- 失敗モード
- 期待する副作用

### 2. Policy / Boundary Contract

何をしてよく、何をしてはいけないかを定義する契約。

- permission
- confirmation policy
- read / suggest / prepare / execute の境界
- allowed tool / denied tool

### 3. Skill Package

再利用単位としての手順知識。

- `SKILL.md`
- `contract.json`
- `examples/`
- 必要に応じて fallback / explanation

Skill は、human-authored でも learned でもよい。  
ただし両者を同列には扱わず、trust level を持たせる。

### 4. Examples / Eval Corpus

artifact の意味を固定するための参照例。

- good / bad example
- edge case
- expected plan
- expected explanation

### 5. Outcome / Reflection History

実行結果から得た学びを保持する履歴。

- success / failure
- user reaction
- reflection
- promotion candidate

これは procedural memory へつながる層でもある。

### 6. Trust Level

artifact は出自に応じて区別する。

- `authored`
- `candidate`
- `approved`
- `compiled`

この区別がないと、探索性と安全性の両方を失う。

---

## A/B/C/D は「実行モード」の違い

以下の 4 パターンは、別々の最終形ではなく、
共有 artifact をどう実行するかの違いとして捉える。

### パターン A: 宣言的プレイブック実行（Rule-first）

- artifact のうち、安定した経路を決定木として固定する
- LLM は不足パラメータ補完や曖昧条件の正規化に限定する
- 説明性と再現性が必要な領域に向く

**役割**

- 安定パスの fallback
- 安全に固定したい処理の表現
- planner runtime と比較するための基準線

**注意点**

- これを中心に据えすぎると、探索が YAML 設計へ引っ張られやすい

---

### パターン B: ドキュメント駆動 Planner-Executor（Plan-first）

- capability / constraint / success criteria / tool contract を参照して計画を作る
- Executor は artifact に定義された contract と policy に従って実行する
- 失敗結果は reflection として次へ返す

**役割**

- 探索ランタイムの中心
- skill の組み合わせ検証
- 新しい planner / model / prompting 方式の比較

**注意点**

- planner 側に知性を寄せすぎず、artifact 設計を first-class に保つ

---

### パターン C: スキルレジストリ型（Capability-first）

- capability / skill / policy / examples を registry で管理する
- user request や heartbeat task を、registry 上の skill へ解決する
- learned skill の昇格先にもなる

**役割**

- 長期的な北極星
- human-authored skill と learned skill の統合点
- planner / rule / compile の共通基盤

**注意点**

- skill 間競合解決だけでなく、trust level と promotion 流れを設計する必要がある

---

### パターン D: 仕様→コード生成ハイブリッド（Compile-first）

- 安定した artifact から orchestrator / validator / policy adapter を生成する
- 実行時解釈を減らし、レイテンシ・コスト・安定性を最適化する
- 高頻度パスや低リスクの定型処理から適用する

**役割**

- 収束先
- hot path の hardening
- runtime 多様性を保ったままの最適化

**注意点**

- DSL を早く固定しすぎると、探索余地を失う

---

## 推奨する進め方

直列の `A -> B -> C -> D` よりも、
次の 2 つのループを回す方が長期方向に合う。

### 1. 探索ループ

- capability / skill / examples を増やす
- Planner-Executor で skill の組み合わせを試す
- runtime や model を差し替えて比較する
- outcome / reflection を蓄積し、candidate skill を作る

### 2. 収束ループ

- 成功率が高く、説明しやすい経路を playbook 化する
- 高頻度パスを compile 化する
- policy と permission boundary を固定する
- approved artifact のみを本流へ昇格させる

この 2 ループを前提にすると、
各パターンの位置づけは次の通り。

- C: 共通基盤
- B: 探索ランタイム
- A: 決定的 fallback
- D: hardening と最適化

---

## 長期ロードマップとの接続

この proposal は 1 つの feature の提案ではなく、
複数トラックを横断する基盤案である。

- T4: reasoning lineage を残し、「なぜその判断か」を追えるようにする
- T5: explanation と permission / kill switch を policy artifact として分離する
- T6: learned skill や reflection を procedural memory として扱う
- T7: action boundary を feature 実装ではなく contract 側へ寄せる

とくに C の skill registry は、
長期記憶 proposal における procedural memory の受け皿として重要である。  
これは単なる横展開の仕組みではなく、
エージェントが学習した手順を昇格・再利用する基盤になりうる。

---

## 防御的に見るべき論点

探索優先で進めるとしても、次は早い段階で防御的に指摘する。

- tool contract が現行 runtime や特定ベンダー前提に固定されること
- policy が playbook や skill ごとに埋まり、行動境界が散らばること
- `docs/specs/` の単一 schema に寄せすぎて artifact の多様性を失うこと
- human-authored と learned artifact の trust level を区別しないこと
- 実行履歴が trace だけに閉じ、skill promotion や reflection へつながらないこと

ここを誤ると、文書駆動が「コードの置き換え」にはなっても、
将来の探索を広げる基盤にはならない。

---

## 評価指標

評価は「コード行数が減ったか」だけでは弱い。  
最低限、次を見たい。

- **artifact 再利用性**: 同じ capability / skill が複数 surface やユースケースで使えるか
- **runtime 可搬性**: planner / executor / compiler を差し替えても artifact を持ち越せるか
- **skill 昇格性**: outcome / reflection から candidate / approved skill へ昇格できるか
- **境界の安定性**: permission / confirmation policy が feature 実装に散らばらないか
- **reasoning lineage**: 実行結果を参照した artifact バージョンまで追えるか
- **安全性**: policy 違反検知率、危険アクションのブロック率

補助指標として、次は引き続き有用である。

- 変更容易性
- 横展開性
- 再現性
- 運用性

---

## 直近の実装タスク案

最初から大きな DSL を作るのではなく、artifact の分離を先に試す。

- `docs/agent-artifacts/` を新設し、`capabilities/`, `policies/`, `skills/`, `evals/` に分ける
- 現行の代表機能を 1 つ選び、capability contract / policy / examples を分けて記述する
- その 1 機能に対して、Planner-Executor で artifact を読む最小ランタイムを作る
- 実行ログに artifact version と trust level を埋め込み、reflection の保存先も決める
- 成功率の高い経路だけを playbook 候補として抽出する

この順序なら、
探索の幅を保ったまま「artifact が本当に資産になるか」を見られる。

---

## 結論

この proposal の価値は、現行コードを文書へ移すこと自体にはない。  
価値があるのは、**spec / skill / policy / examples / outcome を
runtime から独立した永続資産として持てるようにすること**にある。

長期方向としては、
Rule-first を出発点に置くよりも、
Capability-first を中核に据え、
Planner-Executor、Playbook、Compile-first をその周囲の実行モードとして扱う方が強い。

そう見ることで、この proposal は単なる再実装方針ではなく、
iAgent の将来の control plane / knowledge plane を形作る提案になる。
