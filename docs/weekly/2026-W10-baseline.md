# 2026-W10 KPI/SLO Baseline 記録

作成日: 2026-03-05  
目的: 初回 baseline を 1 ファイルに固定し、W11 以降の比較基準にする。

---

## 実施ログ

- 実施日:
  - 2026-03-05 03:11 JST（初回: 一時プロファイル）
  - 2026-03-05 03:13 JST（再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
- 実施者: Codex（自動収集コマンド実行）
- 対象環境: local
- 収集手順: `docs/POC-METRICS-COLLECTION.md`
- 収集コマンド（推奨）: `npm run metrics:poc`
- 備考: 固定プロファイル再計測も実施済み。現時点では観測対象データがなく、KPI は 0 系。

---

## KPI Baseline

## 1) 提案 Accept 率（7日）

- accepted: 0
- dismissed: 0
- snoozed: 0
- total: 0
- acceptRate: 0.0% (0.0000)

## 2) 7日アクティブ率

- activeDays: 0
- activeRate: 0.0% (0.0000)
- days: (なし)

## 3) 通知経由再訪率（proxy, 7日）

- totalHasChanges: 0
- hasFeedback: 0
- proxyRevisitRate: 0.0% (0.0000)

---

## SLO Baseline（暫定）

## 1) Heartbeat 実行成功率（24h）

- 試行回数: 未計測
- 成功回数: 未計測
- 成功率: 未計測

## 2) Push wake 実行成功率（24h）

- 試行回数: 未計測
- 成功回数: 未計測
- 成功率: 未計測

## 3) Heartbeat 遅延 p95（24h）

- p95: 未計測
- 観測メモ: PoC 初回は KPI 収集パイプライン確認を優先

---

## 所感 / 次アクション

1. 固定プロファイルでの baseline 再計測は完了
2. 実運用データ（インタビュー対象者利用データ）を入れた状態で再取得し、実質 baseline を確定する
3. SLO は W11 でログベース集計を開始する
