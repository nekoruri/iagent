# コードベース全体レビュー 完全版（2026-03-03）

> 注記: 2026-03-03 時点の完全記録。lint 件数や一部高優先指摘はその後の修正で変化しているため、現行の source of truth にはしない。

## 実施概要

- 実施日: 2026-03-03
- 対象: `src/`, `server/`, `e2e/`, ビルド・テスト・Lint
- 目的: 既存レビューの要約版に対し、検出事項を漏れなく記録する

## 実行結果サマリー

### Lint

- コマンド: `npm run lint`
- 結果: **失敗**（22 problems: 19 errors, 3 warnings）

### Unit Test

- コマンド: `npm test`
- 結果: **成功**（60 files, 1031 tests passed）
- 補足: `act(...)` 警告が複数テストで発生

### Build

- コマンド: `npm run build`
- 結果: **成功**
- 警告: minify 後 500kB 超 chunk が存在

## 実装レビュー指摘（静的解析以外）

### 1. High: `localStorage` 設定破損時の起動クラッシュ

- `getConfig()` が `JSON.parse(raw)` を例外処理なしで実行。
- `main.tsx` 初期化で `getConfig()` が即時呼び出されるため、壊れた JSON でアプリ起動不能。
- 参照:
  - `src/core/config.ts:189`
  - `src/main.tsx:8`

### 2. Medium: `stopStreaming` が実処理キャンセルになっていない

- 停止は `abortRef` フラグ更新のみで、`run()` 自体の中断は行わない。
- 停止後も処理が継続し、コストや副作用が残りうる。
- 参照:
  - `src/hooks/useAgentChat.ts:99`
  - `src/hooks/useAgentChat.ts:165`
  - `src/hooks/useAgentChat.ts:234`

### 3. Medium: 送信失敗時に未処理 Promise になりうる経路

- `InputBar` が `onSend` を非同期として待たず、`catch` もしない。
- `sendMessage` の前段失敗（API key 不備等）で reject が UI 非通知のまま上がる。
- 参照:
  - `src/components/InputBar.tsx:17`
  - `src/App.tsx:139`
  - `src/hooks/useAgentChat.ts:49`

### 4. Medium: Heartbeat 履歴上限が pinned 多数時に無効化

- `MAX_RECENT_RESULTS` 超過時に pinned を全保持するため、pinned 数次第で上限超過状態が常態化。
- 参照:
  - `src/store/heartbeatStore.ts:63`
  - `src/store/heartbeatStore.ts:67`

### 5. Medium: Lint が恒常失敗で品質ゲートとして不全

- 常時失敗状態のため、新規問題検出が埋もれる。
- 参照（代表）:
  - `src/App.tsx:107`
  - `src/components/InstallPrompt.tsx:8`
  - `src/components/SettingsModal.tsx:66`

## Lint 全指摘（22件・完全版）

| No | Level | File | Line:Col | Rule | Detail |
|---|---|---|---|---|---|
| 1 | warning | `coverage/block-navigation.js` | `1:1` | `unused eslint-disable directive` | Unused eslint-disable directive (no problems were reported) |
| 2 | warning | `coverage/prettify.js` | `1:1` | `unused eslint-disable directive` | Unused eslint-disable directive (no problems were reported) |
| 3 | warning | `coverage/sorter.js` | `1:1` | `unused eslint-disable directive` | Unused eslint-disable directive (no problems were reported) |
| 4 | error | `e2e/chat-streaming.spec.ts` | `77:11` | `@typescript-eslint/no-unused-vars` | `sendButton` is assigned a value but never used |
| 5 | error | `src/App.tsx` | `107:7` | `react-hooks/set-state-in-effect` | `useEffect` 内で同期的に `setShowWizard(true)` を呼び出し |
| 6 | error | `src/components/InstallPrompt.tsx` | `8:5` | `react-hooks/set-state-in-effect` | `useEffect` 内で同期的に `setVisible(...)` を呼び出し |
| 7 | error | `src/components/SettingsModal.tsx` | `66:7` | `react-hooks/immutability` | `setOpenSections` を宣言前に参照 |
| 8 | error | `src/core/agent.test.ts` | `215:22` | `@typescript-eslint/no-explicit-any` | Unexpected any |
| 9 | error | `src/core/agent.test.ts` | `217:55` | `@typescript-eslint/no-unsafe-function-type` | `Function` 型の使用 |
| 10 | error | `src/core/agent.test.ts` | `226:22` | `@typescript-eslint/no-explicit-any` | Unexpected any |
| 11 | error | `src/core/agent.test.ts` | `228:55` | `@typescript-eslint/no-unsafe-function-type` | `Function` 型の使用 |
| 12 | error | `src/core/agent.test.ts` | `242:22` | `@typescript-eslint/no-explicit-any` | Unexpected any |
| 13 | error | `src/core/agent.test.ts` | `244:55` | `@typescript-eslint/no-unsafe-function-type` | `Function` 型の使用 |
| 14 | error | `src/core/agent.test.ts` | `298:22` | `@typescript-eslint/no-explicit-any` | Unexpected any |
| 15 | error | `src/core/heartbeat.test.ts` | `7:10` | `@typescript-eslint/no-unused-vars` | `updateLastChecked` is defined but never used |
| 16 | error | `src/core/heartbeatTools.ts` | `309:3` | `@typescript-eslint/no-unused-vars` | `_now` is defined but never used |
| 17 | error | `src/hooks/useFeedPanel.test.ts` | `85:13` | `@typescript-eslint/no-unused-vars` | `itemIds` is assigned a value but never used |
| 18 | error | `src/store/__mocks__/db.ts` | `61:46` | `@typescript-eslint/no-unused-vars` | `_mode` is defined but never used |
| 19 | error | `src/store/conversationStore.test.ts` | `7:27` | `@typescript-eslint/no-unused-vars` | `listConversations` is defined but never used |
| 20 | error | `src/store/memoryStore.test.ts` | `558:41` | `@typescript-eslint/no-explicit-any` | Unexpected any |
| 21 | error | `src/store/memoryStore.test.ts` | `577:41` | `@typescript-eslint/no-explicit-any` | Unexpected any |
| 22 | error | `src/store/memoryStore.test.ts` | `610:13` | `@typescript-eslint/no-unused-vars` | `categories` is assigned a value but never used |

## テスト実行時の警告・注意ログ

### React `act(...)` 警告が出たテストファイル

- `src/components/SettingsModal.test.tsx`
- `src/hooks/useAgentChat.test.ts`
- `src/hooks/useConversations.test.ts`
- `src/hooks/useHeartbeatPanel.test.ts`

### 失敗ではないが stderr に出力された注意ログ

- `src/core/pushSubscription.test.ts`（再登録時 4xx/5xx/ネットワーク異常の想定ログ）
- `src/store/memoryStore.test.ts`（保護カテゴリのみで飽和時の warning ログ）

## ビルド警告（完全記録）

- `dist/assets/heartbeat.worker-*.js` 約 `618.74 kB`
- `dist/sw.mjs` 約 `637.48 kB`
- Vite 警告:
  - `Some chunks are larger than 500 kB after minification.`

## 追加観測（低優先）

- `src/store/feedStore.ts` に全件ロード前提の `TODO` が 3 箇所あり、データ量増加時に性能劣化の可能性。
  - `src/store/feedStore.ts:155`
  - `src/store/feedStore.ts:174`
  - `src/store/feedStore.ts:184`
