# T1 Capability Matrix

> 作成日: 2026-03-07
> 目的: iAgent が「どの端末 / ブラウザ / 状態」で何をできるかを 1 枚で確認できるようにする
> 関連: [T1-autonomy-runtime.md](T1-autonomy-runtime.md) / [../USER-GUIDE.md](../USER-GUIDE.md) / [../OPERATIONS.md](../OPERATIONS.md)

---

## 1. この文書の位置づけ

この matrix は、**iAgent が現在サポートしている自律実行パス**を整理したものです。  
標準 API の一般論ではなく、**現行実装 + 現行運用方針**を前提にしています。

判定の意味:

- `Yes`: 現行実装でそのまま利用できる
- `Conditional`: 条件を満たした場合のみ利用できる
- `No`: 現行実装では利用できない、または運用対象外
- `Unverified`: Web 標準上の可能性はあるが、iAgent では現時点で運用対象にしていない

---

## 2. 自律実行 capability matrix

| 端末 / 実行形態 | 通知表示 | Push 購読 | タブ閉鎖後の wake-up | Periodic Sync フォールバック | iAgent の推奨パス |
|---|---|---|---|---|---|
| Desktop Chromium（通常タブ） | `Conditional` | `Conditional` | `Conditional` | `No` | Push + Service Worker |
| Desktop Chromium（インストール済み PWA） | `Conditional` | `Conditional` | `Conditional` | `Conditional` | Push、必要に応じて Periodic Sync 補助 |
| Android Chromium（通常タブ） | `Conditional` | `Conditional` | `Conditional` | `No` | Push + Service Worker |
| Android Chromium（インストール済み PWA） | `Conditional` | `Conditional` | `Conditional` | `Conditional` | Push、必要に応じて Periodic Sync 補助 |
| iOS Safari（通常ブラウザ） | `No` | `No` | `No` | `No` | foreground のみ |
| iOS Home Screen PWA | `Conditional` | `Conditional` | `Conditional` | `No` | Push + Service Worker |

条件付きの意味:

- 通知表示: `Notification.permission === 'granted'`
- Push 購読: 通知権限に加え、Service Worker と PushManager が利用可能
- タブ閉鎖後の wake-up: Push 経路が成立し、ブラウザ / OS 側で通知がブロックされていない
- Periodic Sync: `ServiceWorkerRegistration.periodicSync` と Permissions API の両方が通る場合のみ

---

## 3. 端末別メモ

### 3.1 Desktop Chromium

- `Notification API` と `PushManager` は現行実装の前提として利用可能
- 通常タブでも Push 購読自体は可能
- `Periodic Background Sync` は regular tab では使わず、iAgent でも PWA 補助経路としてのみ扱う
- `focusMode` / `quietHours` / `quietDays` は foreground / worker / push 全経路で適用される

### 3.2 Android Chromium

- 自律実行パスは Desktop Chromium と概ね同じ
- 常用デバイスとしての価値は高いが、端末依存で battery / OS 制約の影響を受けやすい
- iAgent の current recommendation は Push 主体、Periodic Sync は補助

### 3.3 iOS Safari（通常ブラウザ）

- iAgent の current policy では、通常ブラウザ状態を background autonomy の運用対象にしない
- Push 通知は Home Screen web app 前提のため、通常ブラウザでは closed-state の自律実行はない
- そのため、通常ブラウザ状態では foreground 利用のみを想定する

### 3.4 iOS Home Screen PWA

- Home Screen に追加された web app では Push が成立する
- current recommendation は「iOS ではまず PWA インストール」が前提
- `Periodic Background Sync` は current implementation / current docs では対象外

---

## 4. 実行レイヤー別 matrix

| レイヤー | 前提 | 役割 | 主な停止条件 |
|---|---|---|---|
| Layer 1: Main Thread | アプリ表示中 | 即時通知、UI 同期、foreground heartbeat | `focusMode`, `quietHours`, `heartbeat.disabled`, `no_api_key` |
| Layer 2: Dedicated Worker | タブ非表示 + Worker 稼働 | タブ非表示中の継続実行 | `focusMode`, `quietHours`, `heartbeat.disabled`, `no_due_tasks` |
| Layer 3a: Service Worker + Push | Push 配信成功 | closed-state wake-up | 通知権限不足、Push 購読切れ、OS/ブラウザ制約 |
| Layer 3b: Service Worker + Periodic Sync | `periodicSync` 利用可能 | Push 不可時の補助 | API 非対応、権限未許可、ブラウザ裁量で未発火 |

---

## 5. current policy

iAgent の current policy は次の通りです。

1. **基本は Push を第一経路とする**
2. **Periodic Sync は Chromium 系 PWA の補助経路**
3. **iOS は Home Screen PWA を前提条件とする**
4. **通常ブラウザ状態の iOS は background autonomy の対象外**
5. **foreground / background / closed の差は、UI ではなく capability として説明する**

---

## 6. docs 整合のための参照先

この matrix を更新したら、次も必ず確認する。

- [../USER-GUIDE.md](../USER-GUIDE.md)
- [../OPERATIONS.md](../OPERATIONS.md)
- [../NOTE-declarative-web-push-2026-03.md](../NOTE-declarative-web-push-2026-03.md)
- [T1-autonomy-runtime.md](T1-autonomy-runtime.md)

---

## 7. 参考

一次情報:

- MDN `PushManager`
- MDN `Notification`
- MDN `Web Periodic Background Synchronization API`
- WebKit `Web Push for Web Apps on iOS and iPadOS`
- WebKit `Meet Declarative Web Push`

この文書は上記に加え、iAgent の current implementation / current docs をもとに整理している。
