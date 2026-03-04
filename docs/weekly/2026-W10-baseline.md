# 2026-W10 KPI/SLO Baseline 記録

作成日: 2026-03-05  
目的: 初回 baseline を 1 ファイルに固定し、W11 以降の比較基準にする。

---

## 実施ログ

- 実施日:
  - 2026-03-05 03:11 JST（初回: 一時プロファイル）
  - 2026-03-05 03:13 JST（再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-05 03:26 JST（厳密KPI3/SLO 自動集計版で再計測）
  - 2026-03-05 03:31 JST（notificationId 突合版で再計測）
  - 2026-03-05 03:33 JST（Good/Watch/Action 自動判定版で再計測）
  - 2026-03-05 03:38 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-05 03:39 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-05 03:52 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
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

## 3) 通知経由再訪率（7日）

- notificationShown: 0
- notificationClicked: 0
- unmatchedClicks: 0
- revisitRate: 0.0% (0.0000)
- shownByChannel: {"desktop":0,"push":0,"periodicSync":0,"unknown":0}
- clickedByChannel: {"desktop":0,"push":0,"periodicSync":0,"unknown":0}
- kpiAcceptStatus: Action
- kpiActiveStatus: Action
- kpiRevisitStatus: Action
- kpiOverallStatus: Action

---

## SLO Baseline（24h）

## 1) Heartbeat 実行成功率（24h）

- 試行回数: 0
- 成功回数: 0
- 失敗回数: 0
- 成功率: 0.0% (0.0000)

## 2) Push wake 実行成功率（24h）

- 試行回数: 0
- 成功回数: 0
- 失敗回数: 0
- 成功率: 0.0% (0.0000)

## 3) Heartbeat 遅延 p95（24h）

- p95: n/a（サンプル数 0）
- 観測メモ: 計測基盤は稼働済み。実運用データ投入後に値が出る想定
- slo24hHeartbeatStatus: NoData
- slo24hPushStatus: NoData
- slo24hLatencyStatus: NoData
- slo24hOverallStatus: NoData

---

## 所感 / 次アクション

1. 固定プロファイルでの baseline 再計測は完了
2. 実運用データ（インタビュー対象者利用データ）を入れた状態で再取得し、実質 baseline を確定する
3. W11 では通知表示/クリックと Heartbeat 実行イベントのサンプル数を増やして再計測する
