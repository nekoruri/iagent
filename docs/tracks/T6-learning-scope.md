# T6 Learning Scope v1

> 作成日: 2026-03-07
> 目的: iAgent が何を学習対象にしていて、何をまだ学習していないかを 1 枚で説明できるようにする
> 関連: [T6-learning-personalization.md](T6-learning-personalization.md) / [../USER-GUIDE.md](../USER-GUIDE.md) / [../ROADMAP.md](../ROADMAP.md)

---

## 1. この文書の位置づけ

T6 で必要なのは、「賢くなった」と言うことではなく、

- 何を学習しているか
- 何を学習していないか
- どの evidence を使っているか
- どこで確認できるか

を固定することです。

この文書は、学習対象の最小 inventory を扱います。

---

## 2. 現在の learning scope

v1 の iAgent は、次の 5 領域を区別して扱う。

| 領域 | 現在の扱い | 主な evidence | 確認場所 |
|---|---|---|---|
| `timing` | 学習対象 | feedback の時刻、曜日別 Accept 傾向 | Settings `学習とパーソナライズ（PoC）` |
| `task frequency` | 学習対象 | task ごとの Accept / Dismiss / Snooze | Settings `学習とパーソナライズ（PoC）` / `suggestion-optimization` |
| `category interest` | 学習対象 | memory tag の増減、recent context | Settings `学習とパーソナライズ（PoC）` |
| `memory quality` | 学習対象 | 再評価候補、stale memory、optimization rule | Settings `学習とパーソナライズ（PoC）` / MemoryPanel |
| `wording / channel` | 未着手 | まだ固定ルール寄り | docs 上で制約として明示 |

---

## 3. 領域ごとの説明

### 3.1 timing

- 目的:
  - 出す時間帯と曜日の偏りを学ぶ
- 現在の signal:
  - Heartbeat feedback の timestamp
  - bestHours / bestDays
  - quiet 候補時間帯 / 曜日
- まだやっていないこと:
  - 文脈別の micro-timing 学習
  - notification ごとの即時適応

### 3.2 task frequency

- 目的:
  - どの task を維持 / 改善 / 頻度削減 / 無効化候補にするかを決める
- 現在の signal:
  - task ごとの Accept 率
  - 前半 / 後半の trend
- 現在の出力:
  - `suggestion-optimization` のルール生成
  - Action Planning への接続

### 3.3 category interest

- 目的:
  - どの topic / tag への関心が上がっているかを見る
- 現在の signal:
  - memory tag の recent / previous 差分
- 現在の制約:
  - 明示的な category weight の user-facing 編集 UI はまだない

### 3.4 memory quality

- 目的:
  - stale / noisy / duplicate な記憶が提案品質を下げ続けないようにする
- 現在の signal:
  - 再評価候補件数
  - 最新の optimization rule
  - MemoryPanel の手動編集 / アーカイブ
- 役割分担:
  - suggestion optimization = 提案側の調整
  - memory quality = 記憶側の見直し

### 3.5 wording / channel

- 現在の状態:
  - v1 では未着手
- 意味:
  - notification 文面
  - explanation の表現
  - push / panel / chat の channel 選択
  はまだ学習対象に含めない

---

## 4. v1 の確認方法

UI:

- 設定 → Heartbeat → `学習とパーソナライズ（PoC）`

確認できるもの:

- 現在どの領域が学習中か
- 最新の最適化ルール
- 再評価候補件数
- wording / channel が未着手であること

---

## 5. v1 完了条件

- learning scope を 1 枚で説明できる
- UI と docs で学習対象が一致している
- `何が学習済みで、何が未着手か` を user/dev の両方が答えられる
