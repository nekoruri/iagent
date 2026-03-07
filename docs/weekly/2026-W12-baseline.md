# 2026-W12 KPI/SLO Baseline 記録

作成日: 2026-03-07  
目的: 初回 baseline を 1 ファイルに固定し、次週以降の比較基準にする。

---

## 実施ログ

- 実施日:
  - 2026-03-07 00:47 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
  - 2026-03-07 22:36 JST（自動再計測: 固定プロファイル `/tmp/iagent-metrics-profile`）
- 実施者: Codex（自動収集コマンド実行）
- 対象環境: local
- 収集手順: `docs/POC-METRICS-COLLECTION.md`
- 収集コマンド（推奨）: `npm run metrics:poc`
- 備考:

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

## 4) オンボーディング最適化（7日）

- onboardingStartedSessions: 0
- onboardingCompletedSessions: 0
- onboardingCompletionRate: 0.0% (0.0000)
- onboardingMedianCompletionSec: n/a
- onboardingRecommendedCompletions: 0
- onboardingRecommendedRate: 0.0% (0.0000)
- onboardingActiveWithin24h: 0
- onboardingActiveWithin24hRate: 0.0% (0.0000)
- onboardingCompletionStatus: NoData
- onboardingRecommendedStatus: NoData
- onboardingMedianStatus: NoData
- onboardingActiveWithin24hStatus: NoData
- onboardingOverallStatus: NoData

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
- 観測メモ:
- slo24hHeartbeatStatus: NoData
- slo24hPushStatus: NoData
- slo24hLatencyStatus: NoData
- slo24hOverallStatus: NoData

---

## 所感 / 次アクション

1. W11 の初回 baseline は Accept 75.0% / Active 57.1% / Revisit 100.0%、SLO Overall Good を記録済み
2. W12 は固定プロファイル継続計測で、通知導線改善の前後比較ができるデータを積む
3. インタビュー不足分は PM型 / 学習者型を優先し、定量と定性の両方で改善優先度を見直す
