# 2026-W11 KPI/SLO Baseline 記録

作成日: 2026-03-05  
目的: 初回 baseline を 1 ファイルに固定し、次週以降の比較基準にする。

---

## 実施ログ

- 実施日:
  - 2026-03-05 04:51 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-06 03:28 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-06 03:32 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-06 03:37 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-06 03:39 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-06 03:41 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-06 03:46 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
- 実施者: Codex（自動収集コマンド実行）
- 対象環境: local
- 収集手順: `docs/POC-METRICS-COLLECTION.md`
- 収集コマンド（推奨）: `npm run metrics:poc`
- 備考: 2026-03-06 03:39 JST は `--seed-sample` によるフォールバックサンプルを使用

---

## KPI Baseline

## 1) 提案 Accept 率（7日）

- accepted: 3
- dismissed: 1
- snoozed: 0
- total: 4
- acceptRate: 75.0% (0.7500)

## 2) 7日アクティブ率

- activeDays: 4
- activeRate: 57.1% (0.5714)
- days: 2026-03-02, 2026-03-03, 2026-03-04, 2026-03-05

## 3) 通知経由再訪率（7日）

- notificationShown: 2
- notificationClicked: 2
- unmatchedClicks: 0
- revisitRate: 100.0% (1.0000)
- shownByChannel: {"desktop":1,"push":1,"periodicSync":0,"unknown":0}
- clickedByChannel: {"desktop":1,"push":1,"periodicSync":0,"unknown":0}
- kpiAcceptStatus: Good
- kpiActiveStatus: Good
- kpiRevisitStatus: Good
- kpiOverallStatus: Good

## 4) オンボーディング最適化（7日）

- onboardingStartedSessions: 1
- onboardingCompletedSessions: 1
- onboardingCompletionRate: 100.0% (1.0000)
- onboardingMedianCompletionSec: 240.0s (240000ms)
- onboardingRecommendedCompletions: 1
- onboardingRecommendedRate: 100.0% (1.0000)
- onboardingActiveWithin24h: 1
- onboardingActiveWithin24hRate: 100.0% (1.0000)
- onboardingCompletionStatus: Good
- onboardingRecommendedStatus: Good
- onboardingMedianStatus: Watch
- onboardingActiveWithin24hStatus: Good
- onboardingOverallStatus: Watch

---

## SLO Baseline（24h）

## 1) Heartbeat 実行成功率（24h）

- 試行回数: 2
- 成功回数: 2
- 失敗回数: 0
- 成功率: 100.0% (1.0000)

## 2) Push wake 実行成功率（24h）

- 試行回数: 1
- 成功回数: 1
- 失敗回数: 0
- 成功率: 100.0% (1.0000)

## 3) Heartbeat 遅延 p95（24h）

- p95: 1.80s（1800ms, サンプル数 2）
- 観測メモ:
- slo24hHeartbeatStatus: Good
- slo24hPushStatus: Good
- slo24hLatencyStatus: Good
- slo24hOverallStatus: Good

---

## 所感 / 次アクション

1. 固定プロファイルで 2026-03-09 まで毎日再計測し、初回利用データを蓄積する。
2. 2026-03-10 / 2026-03-12 / 2026-03-13 の 3 インタビューを完了し、週次レビューに反映する。
3. W12 候補として #33 / #40 / #43 を比較し、W11 締め時に優先度を確定する。
