# T5 Trust Model v1

> 作成日: 2026-03-07
> 目的: ユーザーが「何を任せ、何を任せないか」を説明できる状態にする
> 関連: [T5-trust-safety.md](T5-trust-safety.md) / [T7-action-boundaries.md](T7-action-boundaries.md) / [../USER-GUIDE.md](../USER-GUIDE.md)

---

## 1. この文書の位置づけ

trust model は、iAgent を「便利な UI」ではなく**端末上の半自律的な主体**として扱うための約束事です。

ここで定義するのは:

- 何が自動で起こり得るか
- 何は必ずユーザー判断に残すか
- ユーザーがどう止められるか
- どうすれば説明可能と見なすか

です。

---

## 2. trust の基本原則

### G1. opt-in autonomy

自律動作は既定で最小限にし、通知や Push は明示的に有効化されたときだけ使う。

### G2. least privilege

取れる権限、使う権限、保持する権限は分ける。  
不要な権限は最初から前提にしない。

### G3. user override first

ユーザーはいつでも止められる。  
`focusMode`、`heartbeat.enabled`、通知 permission、least privilege preset が優先される。

### G4. inspectable behavior

自動で起きたことは、少なくとも

- 何が
- いつ
- なぜ

動いたかを後から確認できる。

### G5. reversible where possible

自動変更はなるべく可逆にする。  
設定変更のようなローカル操作は log と rollback を前提に扱う。

### G6. degrade safely

権限・ネットワーク・battery・API キー不足時は、無理に動かず安全側へ倒す。

### G7. local-first by default

ユーザーの継続利用データは、まず端末上で保持・処理する。  
外部送信は observability や API 呼び出しなど必要最小限に留める。

---

## 3. trust zone

現在の iAgent を trust の強さで分類すると次の 4 zone になる。

| zone | 説明 | 現在の例 |
|---|---|---|
| `Z0 Observe` | 観測と記録のみ。ユーザー体験へ直接介入しない | traces, ops-events, action log |
| `Z1 Suggest` | 通知・提案・表示まで。実行はしない | Heartbeat notification, panel, digest |
| `Z2 Reconfigure Local` | ローカル設定やローカル state を自動変更する | Action Planning による quiet hours / task toggle 変更 |
| `Z3 External Act` | 外部副作用を伴う操作 | 現時点では原則対象外 |

v1 の current policy:

- iAgent の既存自律動作は基本 `Z1`
- Action Planning は例外的に `Z2`
- `Z3` は trust model 上、PoC の標準経路に含めない

---

## 4. ユーザーが持つ制御手段

### 強い停止手段

- `heartbeat.enabled = false`
- `focusMode = true`
- least privilege preset 適用

### 経路別停止手段

- 通知 permission の deny
- Push 購読解除
- PWA 非インストール（iOS）

### 個別抑制

- `dismissed`
- `snoozed`
- quiet hours / quiet days

---

## 5. 説明責任の最小条件

「説明できる」と見なす最低条件は次です。

1. 何の trigger で始まったか
2. なぜその timing だったか
3. なぜその channel で出たか
4. なぜ出なかったのか（suppression / stop reason）
5. 自動で設定変更したなら、その reason と detail

現時点での既存 surface:

- Action Planning log
- 権限状態表示
- focus mode 状態
- Heartbeat panel の結果一覧

不足:

- trigger -> decision -> delivery の一貫説明
- suppression reason の user-facing 表示

---

## 6. trust regression の見方

次の兆候は trust regression とみなす。

- 「勝手に変わった」
- 「なぜ出たか分からない」
- 「止め方が分からない」
- 「通知が怖い / うるさい」
- 「任せたくない」

これらは単なる UX 問題ではなく、trust model 破綻のシグナルとして扱う。

---

## 7. v1 の境界

trust model v1 では、次を明確にする。

- 自律通知はあり
- ローカル設定変更は条件付きであり
- 外部副作用の自動実行は標準経路に含めない
- ユーザーが止める手段を常に持つ

---

## 8. 完了条件

- trust の原則が 1 枚で説明できる
- 既存機能が trust zone 上のどこにあるか答えられる
- 「止め方」「なぜ動いたか」「どこまで任せるか」を docs と UI で矛盾なく説明できる
