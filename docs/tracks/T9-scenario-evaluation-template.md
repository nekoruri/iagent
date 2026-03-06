# T9 Scenario Evaluation Template

> 作成日: 2026-03-07
> 目的: feature 単位ではなく生活シナリオ単位で、端末上自律エージェントとしての成立性を評価する
> 関連: [T9-evaluation.md](T9-evaluation.md) / [../POC-KPI.md](../POC-KPI.md) / [../POC-USER-VALIDATION.md](../POC-USER-VALIDATION.md)

---

## 1. この文書の位置づけ

KPI / SLO / interview はあるが、それだけでは

- 常用デバイス上で
- ある生活場面において
- 自律型エージェントとして成立しているか

を言い切りにくい。

このテンプレートは、**生活シナリオ単位**で記録するための評価雛形です。

---

## 2. 評価テンプレート

```md
# シナリオ評価

- シナリオID:
- ペルソナ:
- 日付:
- デバイス:
- 実行形態:
  - desktop-browser / desktop-pwa / mobile-browser / mobile-pwa
- 対象トラック:
  - T1 / T2 / T3 / ...

## 1. シナリオ定義

- 生活場面:
- ユーザーの目的:
- iAgent に期待する役割:

## 2. 事前文脈

- timeOfDay:
- calendarState:
- onlineState:
- focusState:
- deviceMode:
- installState:

## 3. 実際の介入

- trigger:
- interventionLevel:
- channel:
- landing:
- summary:

## 4. ユーザー反応

- reaction:
  - accepted / dismissed / snoozed / ignored / manual-open
- 次に取った行動:
- コメント:

## 5. 評価

- 価値の再現性:
  - 成立 / 微妙 / 非成立
- 運用可能性:
  - 成立 / 微妙 / 非成立
- 観測可能性:
  - 成立 / 微妙 / 非成立
- 端末上エージェントらしさ:
  - 成立 / 微妙 / 非成立

## 6. 学び

- 良かった点:
- 悪かった点:
- 次の仮説:
```

---

## 3. 代表シナリオ候補

### S-A1 情報ヘビーコンシューマーの朝

- ペルソナ: 情報収集型
- 場面: 出勤前の朝
- 期待: digest / briefing による情報圧縮

### S-B1 PM の会議前

- ペルソナ: PM型
- 場面: 会議の 30〜60 分前
- 期待: calendar + related memory による準備支援

### S-C1 学習者の夜

- ペルソナ: 学習者型
- 場面: 夜の学習時間帯
- 期待: 継続ナッジと next action の提示

### S-X1 通知からの再訪

- 横断シナリオ
- 場面: proactive notification を開いた直後
- 期待: 「次に何をすればよいか」が迷わず分かる

---

## 4. 評価のルール

### 4.1 1 回の成功で終わらせない

各シナリオは単発成功ではなく、複数週で再現することを重視する。

### 4.2 KPI と切り離さない

シナリオ評価は定性だけで終えず、

- Accept
- revisit
- active

と照合する。

### 4.3 「非成立」も成果として残す

成立しなかった場面こそ、常用デバイス上の限界を示す重要な知見とみなす。

---

## 5. v1 完了条件

- 少なくとも 3 ペルソナ + 1 横断シナリオが定義される
- weekly からシナリオ単位の学びへリンクできる
- KPI / interview / logs をシナリオ評価へ接続できる
