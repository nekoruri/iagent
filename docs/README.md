# docs ガイド

`docs/` 配下の文書を、**何のための文書か**と**長期研究トラック T1〜T9 のどこに属するか**で整理した案内です。

最初に見る順番は次の通りです。

1. ミッションと長期方針  
   [PROPOSAL-device-agent-research-roadmap.md](PROPOSAL-device-agent-research-roadmap.md)
2. 判断原則とレビュー姿勢  
   [ADR-exploration-first-technical-direction.md](ADR-exploration-first-technical-direction.md)
3. 実装と計画の現在値  
   [ROADMAP.md](ROADMAP.md)
4. 構造と運用方法  
   [ARCHITECTURE.md](ARCHITECTURE.md) / [USER-GUIDE.md](USER-GUIDE.md) / [OPERATIONS.md](OPERATIONS.md)
5. PoC 運用と週次記録  
   [POC-KPI.md](POC-KPI.md) / [POC-SLO.md](POC-SLO.md) / [POC-USER-VALIDATION.md](POC-USER-VALIDATION.md) / [POC-EXIT-CRITERIA.md](POC-EXIT-CRITERIA.md) / `weekly/`
6. 長期トラックごとの具体タスク  
   [tracks/README.md](tracks/README.md)

---

## 1. source of truth

日常的に参照すべき文書です。

| 文書 | 役割 |
|---|---|
| [PROPOSAL-device-agent-research-roadmap.md](PROPOSAL-device-agent-research-roadmap.md) | 研究ミッションと長期トラック T1〜T9 |
| [ADR-exploration-first-technical-direction.md](ADR-exploration-first-technical-direction.md) | 提案・レビュー・設計判断での探索優先 / 重大度重み付けの原則 |
| [ROADMAP.md](ROADMAP.md) | 実装済み / 未実装を含む全体ロードマップ |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 現在のアーキテクチャとデータ構造 |
| [USER-GUIDE.md](USER-GUIDE.md) | 利用者目線の現在仕様 |
| [OPERATIONS.md](OPERATIONS.md) | Push / Proxy / server 運用手順 |
| [REVIEW-TRACKER.md](REVIEW-TRACKER.md) | review-comment 起点の未解決 / 対応済み管理 |
| [POC-EXIT-CRITERIA.md](POC-EXIT-CRITERIA.md) | PoC を go / extend / reset で判断する基準 |

補足:

- 実装の現在値は `ROADMAP` と `ARCHITECTURE` を優先する
- 提案やレビューの判断前提は `ADR-exploration-first-technical-direction` を優先する
- 古い proposal は背景理解には使うが、現在状態の source of truth にはしない

---

## 2. PoC 運用

PoC の観測・週次運用に使う文書です。

| 文書 | 役割 |
|---|---|
| [POC-KPI.md](POC-KPI.md) | 価値の再現性を測る KPI 定義 |
| [POC-SLO.md](POC-SLO.md) | 運用可能性を測る SLO 定義 |
| [POC-USER-VALIDATION.md](POC-USER-VALIDATION.md) | interview / 定性検証ループ |
| [POC-EXIT-CRITERIA.md](POC-EXIT-CRITERIA.md) | KPI / SLO / interview / scenario を束ねる最終判断基準 |
| [POC-METRICS-COLLECTION.md](POC-METRICS-COLLECTION.md) | 週次計測コマンドと運用手順 |
| [MEMO-poc-focus-1-10.md](MEMO-poc-focus-1-10.md) | PoC 運用改善の背景メモ |
| `weekly/` | 週次レビュー、baseline、interview 記録、handoff |
| `templates/` | 週次レビュー / baseline / interview テンプレート |

---

## 3. 長期トラック別の対応表

研究ロードマップの T1〜T9 に対して、既存 docs を対応づけた一覧です。

| トラック | 主文書 |
|---|---|
| `T1 自律実行基盤` | [PROPOSAL-mobile-enhancement.md](PROPOSAL-mobile-enhancement.md), [NOTE-declarative-web-push-2026-03.md](NOTE-declarative-web-push-2026-03.md), [OPERATIONS.md](OPERATIONS.md) |
| `T2 常用デバイス文脈の取得` | [PROPOSAL-proactive-engine.md](PROPOSAL-proactive-engine.md), [USER-GUIDE.md](USER-GUIDE.md) |
| `T3 介入設計` | [PROPOSAL-proactive-engine.md](PROPOSAL-proactive-engine.md), [POC-KPI.md](POC-KPI.md) |
| `T4 オブザーバビリティ基盤` | [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md), [POC-SLO.md](POC-SLO.md) |
| `T5 信頼・安全・可視化` | [MEMO-poc-focus-1-10.md](MEMO-poc-focus-1-10.md), [REVIEW-TRACKER.md](REVIEW-TRACKER.md) |
| `T6 学習とパーソナライズ` | [PROPOSAL-autonomous-agent-evolution.md](PROPOSAL-autonomous-agent-evolution.md) |
| `T7 行動実行の境界設計` | [PROPOSAL-external-integration.md](PROPOSAL-external-integration.md) |
| `T8 端末制約最適化` | [POC-SLO.md](POC-SLO.md), [OPERATIONS.md](OPERATIONS.md) |
| `T9 研究評価設計` | [POC-USER-VALIDATION.md](POC-USER-VALIDATION.md), [POC-KPI.md](POC-KPI.md) |

具体的なタスク分解:

- [tracks/README.md](tracks/README.md)

---

## 4. proposal / memo

背景や設計検討の履歴です。現在仕様ではなく、**判断の文脈**として参照します。

| 文書 | 主用途 |
|---|---|
| [PROPOSAL-autonomous-agent-evolution.md](PROPOSAL-autonomous-agent-evolution.md) | 長期記憶 / 自律進化の研究整理 |
| [PROPOSAL-external-integration.md](PROPOSAL-external-integration.md) | 外部情報収集と MCP 活用の設計背景 |
| [PROPOSAL-mobile-enhancement.md](PROPOSAL-mobile-enhancement.md) | モバイル/PWA 制約整理 |
| [PROPOSAL-proactive-engine.md](PROPOSAL-proactive-engine.md) | 介入設計とペルソナ駆動の詳細 |
| [PROPOSAL-test-infrastructure.md](PROPOSAL-test-infrastructure.md) | テスト基盤強化の履歴 |
| [PROPOSAL-multimodal-review-fixes.md](PROPOSAL-multimodal-review-fixes.md) | マルチモーダル review 対応履歴 |
| [PROPOSAL-document-driven-agent-architecture.md](PROPOSAL-document-driven-agent-architecture.md) | ドキュメント駆動再実装の方針整理 |
| [NOTE-declarative-web-push-2026-03.md](NOTE-declarative-web-push-2026-03.md) | Declarative Push の技術メモ |

---

## 5. テスト計画

個別テーマの手動 / 自動テスト計画です。

| 文書 | 対象 |
|---|---|
| [test-plan-notification-api.md](test-plan-notification-api.md) | Notification API |
| [test-plan-proactive-phase0.md](test-plan-proactive-phase0.md) | proactive engine 初期フェーズ |

---

## 6. 履歴記録

古いレビューや時点スナップショットです。  
最新状態の確認には使わず、**その時点で何が見えていたか**を辿るために使います。

| 文書 | 位置づけ |
|---|---|
| [REVIEW-2026-03-03.md](REVIEW-2026-03-03.md) | 要約レビューの時点記録 |
| [REVIEW-2026-03-03-full.md](REVIEW-2026-03-03-full.md) | フルレビューの時点記録 |
| [REVIEW-2026-03-03-complete-findings.md](REVIEW-2026-03-03-complete-findings.md) | 完全所見の時点記録 |

---

## 7. 読み方のルール

- まず目的を決める  
  研究方針を見るなら `PROPOSAL-device-agent-research-roadmap`  
  実装状態を見るなら `ROADMAP` / `ARCHITECTURE`  
  運用を見るなら `POC-*` / `weekly/`
- proposal は背景、roadmap は現在値、と分けて読む
- 週次記録は `weekly/` を source of truth とし、古い review 文書に戻らない
