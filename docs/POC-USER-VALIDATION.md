# PoC ユーザー検証ループ（項目 2）

作成日: 2026-03-05  
対象: iAgent PoC
関連トラック: `T3 介入設計` / `T5 信頼・安全・可視化` / `T9 研究評価設計`

この文書は、**定性評価と週次学習サイクルの source of truth** です。

---

## 目的

ログだけでは見えない体験品質（邪魔・安心・信頼・負担）を、週次で検証し続ける。

---

## 検証対象ペルソナ

- 情報収集型（大量情報の圧縮価値を重視）
- PM型（リマインド・漏れ防止価値を重視）
- 学習者型（継続支援・ナッジ価値を重視）

各ペルソナ最低 1 名、理想 2 名以上で運用する。

---

## 週次サイクル

1. 月曜: 検証仮説を 1〜2 個設定  
2. 火〜木: 実利用ログ + インタビュー実施  
3. 金曜: 学びを集約し、次週施策を決定  

---

## 毎週聞く質問（固定）

1. 今週「助かった提案」は何か（具体シーン）  
2. 今週「不要だった提案」は何か（なぜ不要か）  
3. 通知の頻度は適切か（多い / 少ない / ちょうどよい）  
4. 前週より賢くなった実感はあるか（ある / ない）  
5. 来週必ず改善してほしい点は何か  

---

## 記録テンプレート

- インタビュー記録: `docs/templates/USER-INTERVIEW-NOTE.md`
- 週次統合レビュー: `docs/templates/WEEKLY-REVIEW.md`
- 週次 baseline: `docs/templates/WEEKLY-BASELINE.md`

---

## 週次ファイル初期化（自動）

新しい週の雛形は以下で一括作成できる:

```bash
npm run poc:init-week -- --week 2026-W11
```

生成対象:

- `docs/weekly/<week>.md`
- `docs/weekly/<week>-baseline.md`
- `docs/weekly/<week>-interview-plan.md`
- `docs/weekly/interviews/<week>-info-collector.md`
- `docs/weekly/interviews/<week>-pm.md`
- `docs/weekly/interviews/<week>-learner.md`
- `docs/weekly/scenarios/<week>-S-A1.md`
- `docs/weekly/scenarios/<week>-S-B1.md`
- `docs/weekly/scenarios/<week>-S-C1.md`
- `docs/weekly/scenarios/<week>-S-X1.md`

補足:

- 既存ファイルは上書きしない（`--force` 指定時のみ上書き）
- 週次レビューの `担当:` は `--owner` で指定可能

---

## インタビュー結果の週次レビュー反映（自動）

3 ペルソナの記録ファイルを読み取り、`docs/weekly/<week>.md` の「ユーザー検証（項目2）」を更新する:

```bash
npm run poc:sync-validation -- --week 2026-W11
```

補足:

- 既定では `docs/weekly/interviews/<week>-*.md` を読む
- `--dry-run` でファイル更新せず、生成内容だけ確認できる
- 事前に `ステータス:` を更新するか、記録項目を入力すると「実施済み」と判定される
- KPI/SLO 反映も含めた週次一括実行は `npm run poc:run-week -- --week <week>` を使う
- レビュー締め前は `npm run poc:check-week -- --week <week> --strict --require-interviews` を実行する
- 一括実行の中でチェックする場合は `npm run poc:run-week -- --week <week> --check --check-strict --check-require-interviews`
- 週次締めは `npm run poc:close-week -- --week <week>` で strict + 最終チェックをまとめて実行できる
- チェック結果を保存する場合は `--report-json` / `--check-report-json` を利用する
- 予定日前のインタビューを厳格エラーにしたくない場合は `--as-of` / `--check-as-of` で基準日を固定する
- strict チェックでは、`ステータス: 実施済み` の記録に主要項目（よかった/不要提案、通知評価、Must改善）が未入力だとエラーになる

シナリオ評価を weekly review に反映する:

```bash
npm run poc:sync-scenarios -- --week 2026-W11
```

補足:

- `docs/weekly/scenarios/<week>-S-*.md` を読む
- weekly review の `### シナリオ評価` サブセクションだけを更新する
- `npm run poc:run-week -- --week <week>` では validation sync の後に自動実行される

---

## 意思決定ルール

1. 同種の不満が 2 名以上で出たら、翌週の必須対応に昇格する。  
2. 高評価シーンは「再現条件」を抽出して機能化する。  
3. 仮説が外れた場合は、仮説を修正して翌週再検証する。  

---

## PoC 期間で最低限達成したい状態

- 3 ペルソナすべてで「明確に助かった体験」の実例が各 3 件以上ある。  
- 「通知が邪魔」という定性コメントが週次で減少傾向になる。  
- KPI（`docs/POC-KPI.md`）と定性評価が矛盾した場合、原因を説明できる。  
