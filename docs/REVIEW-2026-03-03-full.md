# コードベース全体レビュー（2026-03-03 / Full）

## 実施概要

- 実施日: 2026-03-03
- 対象: `src/`, `server/`, `e2e/`, ビルド・テスト・Lint 設定
- 観点: バグ、挙動不整合、運用リスク、テスト信頼性

## 実行コマンド結果

### 1. Lint

- コマンド: `npm run lint`
- 結果: **失敗**（22 problems: 19 errors, 3 warnings）
- 主な内訳:
  - `react-hooks/set-state-in-effect`: `src/App.tsx:107`, `src/components/InstallPrompt.tsx:8`
  - `react-hooks/immutability`: `src/components/SettingsModal.tsx:66`
  - 未使用変数 (`no-unused-vars`): テストコード・一部実装に複数
  - `no-explicit-any` / `no-unsafe-function-type`: テストコード中心に複数

### 2. Unit Test

- コマンド: `npm test`
- 結果: **成功**（60 files, 1031 tests passed）
- 補足: React テストで `act(...)` 警告が多数発生（失敗ではないがノイズ大）

### 3. Build

- コマンド: `npm run build`
- 結果: **成功**
- 補足: 500kB 超 chunk 警告あり
  - `dist/assets/heartbeat.worker-*.js` 約 618kB
  - `dist/sw.mjs` 約 637kB

## 指摘事項（重大度順）

### 1. High: `localStorage` 設定破損時にアプリが初期化段階でクラッシュする

- 事象:
  - `getConfig()` が `JSON.parse(raw)` を例外処理なしで実行している。
  - `main.tsx` 起動直後の `applyTheme(getStoredThemeMode())` 経由で `getConfig()` が呼ばれるため、設定 JSON が壊れているとアプリ全体が描画前に落ちる。
- 影響:
  - 画面が表示されず操作不能になる（回復には `localStorage` の手動削除が必要）。
- 参照:
  - `src/core/config.ts:189`
  - `src/main.tsx:8`

### 2. Medium: `stopStreaming` が実際の実行キャンセルになっていない

- 事象:
  - 停止操作は `abortRef.current = true` のみで、実行中の `run()` やネットワーク処理自体は中断しない。
  - UI は 2 秒タイムアウトで戻るが、バックグラウンド処理は継続しうる。
- 影響:
  - API コスト増加。
  - ツール実行を伴う場合、ユーザー停止後も副作用が継続する可能性。
- 参照:
  - `src/hooks/useAgentChat.ts:99`
  - `src/hooks/useAgentChat.ts:165`
  - `src/hooks/useAgentChat.ts:234`

### 3. Medium: 送信失敗が UI でハンドリングされず、Promise rejection が未処理化する経路がある

- 事象:
  - `InputBar` は `onSend` を同期関数として呼び出し、`await` / `catch` を行わない。
  - `App` の `handleSend` は `async` で、`sendMessage` が `try` より前で失敗する経路（API key 欠落、保存失敗など）では reject がそのまま上がる。
- 影響:
  - 入力欄はクリアされる一方でエラーがユーザーに提示されない。
  - ランタイムの未処理 Promise 警告を誘発する。
- 参照:
  - `src/components/InputBar.tsx:17`
  - `src/App.tsx:139`
  - `src/hooks/useAgentChat.ts:49`
  - `src/hooks/useAgentChat.ts:65`

### 4. Medium: Heartbeat 履歴件数上限 (`MAX_RECENT_RESULTS`) が pinned 多数時に実質無効化される

- 事象:
  - 上限超過時に `pinned` を全保持し、`unpinned` のみ削る実装。
  - `pinned` が上限を超えると、最終配列も上限を超え続ける。
- 影響:
  - Heartbeat 履歴が無制限に増え、IndexedDB 使用量増加を招く。
- 参照:
  - `src/store/heartbeatStore.ts:63`
  - `src/store/heartbeatStore.ts:67`

### 5. Medium: Lint が現状ゲートとして機能しておらず、品質シグナルが低下している

- 事象:
  - 現在 `npm run lint` が恒常的に失敗する状態。
- 影響:
  - 新規問題の検出が埋もれやすく、CI 品質ゲートとして機能しない。
- 参照（代表）:
  - `src/App.tsx:107`
  - `src/components/InstallPrompt.tsx:8`
  - `src/components/SettingsModal.tsx:66`
  - `src/core/heartbeatTools.ts:309`

## 非ブロッカー観測

- `npm test` は全件成功しているが、`act(...)` 警告が多数あり、テスト出力ノイズが大きい。
- `npm run build` は成功しているが、Worker/SW バンドルサイズが大きく、配信最適化余地がある。

## 今回未実施

- E2E テスト (`npm run test:e2e`) は未実行。
- 実運用デプロイ環境（Cloudflare Workers 本番）での疎通確認は未実施。
