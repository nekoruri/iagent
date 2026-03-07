# PoC Exit Criteria

作成日: 2026-03-07  
対象: iAgent PoC  
関連トラック: `T3 介入設計` / `T4 オブザーバビリティ基盤` / `T5 信頼・安全・可視化` / `T8 端末制約最適化` / `T9 研究評価設計`

この文書は、**PoC を go / extend / reset のどれで判断するかの source of truth** です。

---

## 目的

PoC の終了判断を、実装量や機能数ではなく、

- 常用デバイス上で価値が再現しているか
- 運用可能か
- 観測できるか
- 端末上自律エージェントらしさがあるか

で揃える。

---

## この文書が束ねるもの

個別の運用基準は既存 docs に残し、この文書では**統合判断**だけを行う。

- 定量 KPI: [POC-KPI.md](POC-KPI.md)
- 運用 SLO: [POC-SLO.md](POC-SLO.md)
- interview / 定性評価: [POC-USER-VALIDATION.md](POC-USER-VALIDATION.md)
- 生活シナリオ評価: [tracks/T9-scenario-evaluation-template.md](tracks/T9-scenario-evaluation-template.md)
- 長期方針: [PROPOSAL-device-agent-research-roadmap.md](PROPOSAL-device-agent-research-roadmap.md)

---

## 判定単位

### 1. 週次の暫定判定

毎週の review では、`Go / Extend / Reset` の**暫定判定**を残す。  
記録先は `docs/weekly/<week>.md` の `### Exit Criteria 状態`。

### 2. マイルストーン判定

PoC を一区切りにする最終判断は、**直近連続 2 週**の evidence を見て行う。  
単発の成功週だけでは exit と見なさない。

---

## 判定ラベル

### Go

PoC の現フェーズで検証したい仮説が、一段成立したと判断する状態。  
次フェーズの productization / research expansion に進んでよい。

### Extend

方向性は有望だが、evidence がまだ不足している状態。  
PoC は継続し、欠けている証拠を優先的に集める。

### Reset

仮説、介入設計、運用設計、trust いずれかに構造的な見直しが必要な状態。  
単なる tuning ではなく、前提や設計をやり直す。

---

## Exit Criteria

PoC を `Go` と判定するには、以下 4 軸をすべて満たす。

## 1. 価値の再現性

### 必須条件

- 直近連続 2 週で、KPI の Overall が `Good` または `Watch` に収まる
- `Action` 判定の KPI が 2 週連続で出ていない
- 3 ペルソナすべてで、`明確に助かった体験` の実例が各 3 件以上ある
- 代表シナリオ `S-A1 / S-B1 / S-C1 / S-X1` のうち 3 つ以上で、別週に 2 回以上 `成立` が記録されている

### 見る文書

- [POC-KPI.md](POC-KPI.md)
- [POC-USER-VALIDATION.md](POC-USER-VALIDATION.md)
- `docs/weekly/scenarios/`

## 2. 運用可能性

### 必須条件

- 直近連続 2 週で、SLO Alert が発生していない
- Heartbeat / notification 系に、1 週以上放置された重大障害がない
- `新機能を止めて安定化を優先すべき状態` が継続していない

### 見る文書

- [POC-SLO.md](POC-SLO.md)
- [POC-METRICS-COLLECTION.md](POC-METRICS-COLLECTION.md)
- `docs/weekly/<week>.md`

## 3. 観測可能性

### 必須条件

- 成立を主張するシナリオについて、`trigger -> context -> decision -> delivery -> reaction` を後から追える
- KPI と interview が矛盾した週に、原因を説明できる
- user-facing explanation と developer-facing trace が、主要 proactive surface で整合している

### 見る文書

- [tracks/T4-autonomy-event-schema.md](tracks/T4-autonomy-event-schema.md)
- [tracks/T4-observability.md](tracks/T4-observability.md)
- [POC-USER-VALIDATION.md](POC-USER-VALIDATION.md)

## 4. 端末上自律エージェントらしさ

### 必須条件

- ユーザーが毎回チャットを開きに行かなくても、端末上で proactive 介入が成立している
- `S-X1 通知からの再訪` が別週に 2 回以上 `成立` している
- `止め方が分からない` `なぜ出たか分からない` が主要な不満として残っていない
- foreground だけでなく、少なくとも 1 つ以上の background / wake-up 経路で価値提供が成立している

### 見る文書

- [tracks/T1-capability-matrix.md](tracks/T1-capability-matrix.md)
- [tracks/T3-intervention-taxonomy.md](tracks/T3-intervention-taxonomy.md)
- [tracks/T5-trust-model.md](tracks/T5-trust-model.md)
- `docs/weekly/scenarios/`

---

## Hard Fail Signal

以下はいずれか 1 つでもあれば、暫定判定を `Reset` 寄りに倒す。

- KPI の Overall が 2 週連続で `Action`
- SLO Alert が 2 週連続で発生
- `通知が怖い / うるさい / 止め方が分からない` が 2 ペルソナ以上で継続
- 成立したように見えるシナリオが、実際には manual-open 前提で proactive 介入になっていない
- `なぜ今これが出たか` を logs / UI / trace のいずれでも説明できない

---

## 週次運用ルール

1. 毎週レビューで `Go / Extend / Reset` の暫定判定を残す  
2. 判定と逆向きの evidence があれば、必ず `根拠` に明記する  
3. `Extend` の週は、何が足りないのかを次週アクションに落とす  
4. `Reset` の週は、新機能追加より先に仮説や設計の見直しを優先する  

---

## 現在の暫定判定（2026-03-07）

`Extend`

理由:

1. KPI / SLO / observability 基盤は揃ってきたが、3 ペルソナの interview evidence がまだ不足している  
2. scenario evaluation はテンプレートと weekly 連携まで整ったが、複数週の `成立` 記録が足りない  
3. explanation / landing / trust / budget の基礎実装は入ったため、次は evidence 集めへ進める状態にある  
