# T2 常用デバイス文脈の取得

## 目的

スマホなど常用デバイスだから得られる文脈を、提案や行動に使える形へ変換する。

## 現在地

- 時刻、カレンダー、オンライン状態、クリップ、音声、カメラなどの入口は部分的にある
- ただし、それらを統合した「今どの場面か」のモデルはまだない

## 具体タスク

### Now

- 端末文脈の共通スキーマを定義する
- coarse-grained な場面分類を決める
  - 仕事中
  - 移動中
  - 会議前
  - 学習中
  - 休息中
- 既存シグナルを場面分類へ対応づける
- 最小権限で取得すべき文脈と、未取得でも動く代替経路を整理する

## Issue 粒度の分解

### T2-1 context snapshot schema v1

- 出力:
  - `timeOfDay`
  - `calendarState`
  - `onlineState`
  - `focusState`
  - `deviceMode`
  の最小スキーマ
- 完了条件:
  - Heartbeat / chat の両方で参照可能な shape が決まる
- 成果物:
  - [T2-context-snapshot.md](T2-context-snapshot.md)

### T2-2 coarse-grained 場面分類

- 出力:
  - 仕事中 / 移動中 / 会議前 / 学習中 / 休息中 の定義
- 完了条件:
  - 既存シグナルだけで暫定判定できる

### T2-3 signal mapping 表

- 出力:
  - 既存シグナル -> 文脈推定への対応表
- 完了条件:
  - どの推定が heuristic で、どの推定が explicit か区別される

### T2-4 permission-minimum policy

- 出力:
  - 文脈取得に必要な最小権限一覧
  - 権限未取得時の fallback
- 完了条件:
  - 「権限がなくても degrade して動く」が説明できる

### Next

- カレンダー / online / focus / time-of-day を統合した context snapshot を導入する
- context snapshot を Heartbeat と chat の両方で利用する
- 文脈取得 failure を observability に流す
- 共有シートやモバイル固有入口の優先度を再評価する

### Later

- 位置情報や移動状態の導入可否を privacy / battery 観点で再検討する
- 端末文脈の coarse-grained 推定をユーザーが監査できるようにする

## 成果判定

- 提案 / 通知 / 実行ログに「どの文脈で動いたか」が残る
- 文脈取得がなくても degrade して動く
- ユーザーが文脈利用を怖がらない

## 関連

- [../PROPOSAL-device-agent-research-roadmap.md](../PROPOSAL-device-agent-research-roadmap.md)
- [../PROPOSAL-proactive-engine.md](../PROPOSAL-proactive-engine.md)
- [../USER-GUIDE.md](../USER-GUIDE.md)
