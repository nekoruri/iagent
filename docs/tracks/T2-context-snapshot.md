# T2 Context Snapshot Schema v1

> 作成日: 2026-03-07
> 目的: 端末上で取得できる最小文脈を、Heartbeat / chat / observability で共有できる形にする
> 関連: [T2-device-context.md](T2-device-context.md) / [T4-autonomy-event-schema.md](T4-autonomy-event-schema.md)

---

## 1. この文書の位置づけ

`context snapshot` は「今どの場面か」を coarse-grained に表現するための最小単位です。  
ここで定義するのは、**現行実装で無理なく取れるシグナルだけ**を使った v1 です。

重いシグナル:

- 正確な位置情報
- 移動速度
- OS レベルの activity recognition

は v1 には含めません。

---

## 2. schema v1

```ts
interface DeviceContextSnapshotV1 {
  capturedAt: number
  timeOfDay: 'morning' | 'daytime' | 'evening' | 'late-night'
  calendarState: 'empty' | 'upcoming-soon' | 'in-meeting-window' | 'busy-today'
  onlineState: 'online' | 'offline'
  focusState: 'focused' | 'normal' | 'quiet-hours'
  deviceMode: 'desktop-browser' | 'desktop-pwa' | 'mobile-browser' | 'mobile-pwa'
  installState: 'installed' | 'browser'
  scene: 'morning-briefing' | 'pre-meeting' | 'focused-work' | 'evening-review' | 'offline-recovery' | 'late-night' | 'general'
}
```

補足:

- `capturedAt` は snapshot 作成時刻
- `timeOfDay` はローカル時刻から機械的に決める
- `calendarState` は coarse-grained に予定密度を表す
- `focusState` は `focusMode` や静寂時間を含めた「介入可否に近い状態」
- `deviceMode` は layout / capability に関わる区分
- `scene` は user-facing explanation や suppression の粗い場面分類に使う

---

## 3. field 定義

### 3.1 `timeOfDay`

| 値 | 目安 |
|---|---|
| `morning` | 05:00–10:59 |
| `daytime` | 11:00–17:59 |
| `evening` | 18:00–22:59 |
| `late-night` | 23:00–04:59 |

用途:

- ブリーフィング / digest / proactive notification の出し分け
- intervention taxonomy との接続

### 3.2 `calendarState`

v1 では次の heuristic を使う。

| 値 | 条件 |
|---|---|
| `empty` | 当日予定なし |
| `upcoming-soon` | 1 時間以内の予定あり |
| `in-meeting-window` | 直近前後の会議準備時間帯として扱う窓に入る |
| `busy-today` | 当日予定が複数あり、empty ではない |

補足:

- `in-meeting-window` は厳密な会議中判定ではなく、介入抑制 / 予定参照強化の heuristic
- v1 は `calendar-check` の既存ロジックに寄せる

### 3.3 `onlineState`

| 値 | 取得元 |
|---|---|
| `online` | `navigator.onLine === true` |
| `offline` | `navigator.onLine === false` |

用途:

- suggestion / sync / fetch の degradation 判断

### 3.4 `focusState`

| 値 | 条件 |
|---|---|
| `focused` | `focusMode === true` |
| `quiet-hours` | `quietHours` / `quietDays` に該当 |
| `normal` | 上記以外 |

用途:

- intervention suppression
- explanation log で「なぜ出なかったか」を示す

### 3.5 `deviceMode`

| 値 | 条件 |
|---|---|
| `desktop-browser` | desktop かつ browser mode |
| `desktop-pwa` | desktop かつ standalone |
| `mobile-browser` | mobile かつ browser mode |
| `mobile-pwa` | mobile かつ standalone |

v1 では次のシグナルから推定する。

- viewport 幅
- `display-mode: standalone`
- iOS `navigator.standalone`

### 3.6 `installState`

| 値 | 条件 |
|---|---|
| `installed` | standalone / home screen app |
| `browser` | 通常ブラウザタブ |

用途:

- T1 capability matrix と接続
- Push / Periodic Sync の説明条件に利用

### 3.7 `scene`

`scene` は上の field から導く coarse-grained な場面分類。

| 値 | 主な条件 |
|---|---|
| `morning-briefing` | `timeOfDay=morning` |
| `pre-meeting` | `calendarState=upcoming-soon` or `in-meeting-window` |
| `focused-work` | `focusState=focused` |
| `evening-review` | `timeOfDay=evening` |
| `offline-recovery` | `onlineState=offline` |
| `late-night` | `timeOfDay=late-night` |
| `general` | 上記以外、または context が欠ける場面 |

用途:

- `whyNow` explanation の coarse-grained な説明
- suppression / no-change の user-facing 文言
- T3 intervention taxonomy の適用条件整理

---

## 4. signal mapping

| snapshot field | 現行シグナル | 取得コスト | 性質 |
|---|---|---|---|
| `timeOfDay` | `Date` | 低 | explicit |
| `calendarState` | calendar store / calendar-check 既存ロジック | 低 | heuristic |
| `onlineState` | `navigator.onLine` | 低 | explicit |
| `focusState` | `focusMode`, `quietHours`, `quietDays` | 低 | explicit + derived |
| `deviceMode` | viewport, standalone 判定 | 低 | heuristic |
| `installState` | `display-mode`, `navigator.standalone` | 低 | explicit |
| `scene` | 上記 field の derived scene | 低 | heuristic |

v1 で未使用:

- geolocation
- motion / activity
- Bluetooth / proximity
- OS notification summary 状態

---

## 5. coarse-grained 場面分類への接続

`context snapshot` は直接ペルソナ判断に使うのではなく、次の場面分類の材料にする。

| 場面 | 例 |
|---|---|
| `仕事中` | `daytime` + `online` + `calendarState != empty` |
| `移動中` | mobile + online/offline 変動あり + calendar sparse |
| `会議前` | `calendarState = upcoming-soon` or `in-meeting-window` |
| `学習中` | evening + desktop/mobile-pwa + calm calendar |
| `休息中` | late-night or explicit quiet/focused state |

この判定は v1 では heuristic とし、確信度の高い推定はしない。

current implementation:

- `scene` は実装済みで、`morning-briefing / pre-meeting / focused-work / evening-review / offline-recovery / late-night / general` を返す
- Settings の autonomy flow 一覧や Heartbeat explanation では `scene` を先頭に表示する

---

## 6. fallback policy

文脈取得が欠けても snapshot 自体は作成する。

| 欠損 | fallback |
|---|---|
| calendar 取得失敗 | `calendarState = empty` ではなく `busy-today` 推定を避け、`empty` 扱いに固定しない |
| online 不明 | `onlineState = online` を既定にしない。unknown を導入するか、v1 では取得必須にする |
| install 判定不能 | `browser` 扱いに倒す |
| focus 情報欠損 | `normal` 扱い |

v1 方針:

- missing context で停止しない
- ただし observability には「欠損」を残す

---

## 7. 完了条件

- Heartbeat / chat / observability の共通入力として使える
- 既存シグナルだけで snapshot が構成できる
- 権限を増やさずに「今どの場面か」を粗く表現できる
