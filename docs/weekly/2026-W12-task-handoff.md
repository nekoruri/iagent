# 2026-W12 作業引き継ぎ

作成日: 2026-03-07  
目的: 作業環境を切り替えても、次の着手点をそのまま再開できるようにする。

---

## 1. 現在地

- W11 は `2026-03-07` 時点で暫定締め済み
- strict チェック結果は `errors: 0`, `warnings: 4`
- warning は PM型 / 学習者型インタビュー未実施のみ
- 情報収集型インタビューから得られた Must は「通知を開いたあとに次に何をすればよいか分かる導線」
- `2026-03-07` に `#36` / `#43` / `#33` を実装し、関連コンポーネントテストと型確認を通過
- 同日 `npm run metrics:poc -- --week 2026-W12 --user-data-dir /tmp/iagent-metrics-profile --seed-sample` を実行し、W12 baseline を更新
- 続けて P0 基盤を実装し、`flowId` / `contextSnapshot` / `autonomy-stage` を Heartbeat 経路へ導入した
- Settings のオブザーバビリティで recent autonomy flow / trace detail を確認できる
- Heartbeat / Feed / chat に explanation disclosure を追加し、通知本文には重要タスクのみ短い理由を入れた
- 追加のテスト warning 整理を行い、`SettingsModal` と `useHeartbeatPanel` の代表的な `act(...)` warning を削減した

参照:

- `docs/weekly/2026-W11.md`
- `docs/weekly/2026-W11-check-strict-2026-03-07.json`
- `docs/weekly/interviews/2026-W11-info-collector.md`

---

## 2. 次にやること

1. 固定プロファイルで W12 メトリクスを継続計測し、P0 explanation / landing 改善後の数値変化を観測する
2. notification 本文の `重要タスクのみ理由表示` が適切かを dogfooding で確認し、必要なら対象タスク集合を再調整する
3. interview はいったん別枠保留のまま、`docs/weekly/2026-W12.md` に P0 所見と次週判断材料を反映する

---

## 3. 完了済み実装タスク

### A. #36 TaskProgress クリック可能インジケーター

主な変更箇所:

- `src/components/TaskProgress.tsx`
- `src/components/TaskProgress.test.tsx`
- `src/index.css`

実施内容:

- summary 行を `button` 化し、「詳細を開く / 閉じる」ラベルとトグル表示を追加
- `aria-expanded` を付与し、Enter / Space で開閉できるようにした
- 専用コンポーネントテストを追加した

### B. #43 HeartbeatPanel ピン / 変更ありスタイル競合

主な変更箇所:

- `src/components/HeartbeatPanel.tsx`
- `src/components/HeartbeatPanel.test.tsx`
- `src/index.css`

実施内容:

- `変更あり` を左ボーダー、`ピン留め` を背景と状態バッジで表現するように整理
- `hasChanges && pinned` 用の明示 class を追加し、CSS の後勝ち依存を除去
- 既存フィードバック挙動を維持したままテストを追加した

### C. #33 Notification API パーミッション再レンダリング

主な変更箇所:

- `src/components/SettingsModal.tsx`
- `src/components/SettingsModal.test.tsx`

実施内容:

- 外部権限変更後は `checked` 表示より実権限を優先し、blocked 状態と矛盾しない UI に修正
- モーダル再表示時の再同期テストと、権限喪失時の unchecked 表示テストを追加
- `権限を再確認` ボタン挙動との競合はなし

### D. P0 自律実行観測基盤

主な変更箇所:

- `src/core/contextSnapshot.ts`
- `src/core/autonomyEvent.ts`
- `src/core/autonomyDiagnostics.ts`
- `src/core/heartbeatCapabilities.ts`
- `src/components/SettingsModal.tsx`
- `src/core/heartbeat.ts`
- `src/core/heartbeatCommon.ts`
- `src/store/heartbeatStore.ts`

実施内容:

- `flowId` / `contextSnapshotId` / `autonomy-stage` を Heartbeat 経路へ追加し、flow 単位で追跡できるようにした
- Settings に current capability summary、recent autonomy flow、trace detail を追加した
- `autonomy-stage` は `trigger/context`、`heartbeat-run` は `decision` として役割を分離した

### E. explanation UX

主な変更箇所:

- `src/components/ExplanationDisclosure.tsx`
- `src/components/HeartbeatPanel.tsx`
- `src/components/FeedPanel.tsx`
- `src/components/MessageBubble.tsx`
- `src/core/heartbeatNotificationText.ts`
- `src/App.tsx`

実施内容:

- Heartbeat / Feed / chat に explanation disclosure を追加し、`理由を見る` から `なぜ今` を開けるようにした
- 通知本文には context 由来の短い理由を追加した
- 通知本文の理由付与は重要タスク（`calendar-check`, `briefing-morning`, `feed-check`, `rss-digest-daily`, `reflection`, `web-monitor-check`）のみに限定した

---

## 4. 残作業の優先順

1. W12 メトリクス継続計測
2. explanation / landing の dogfooding
3. 週次レビュー反映と次週タスク起票
4. interview 再開判断（別枠）

理由:

- P0 の実装は完了したため、直近の不確実性は「説明量が適切か」と「数値がどう動くか」に移った
- interview は残るが、現時点では docs / runtime / observability の整合維持を優先したい
- W12 の次判断は、まず dogfooding と継続計測が揃ってから行うほうが精度が高い

---

## 5. 実行コマンド

状態確認:

```bash
node scripts/check-poc-week.mjs --week 2026-W11 --strict --require-interviews --as-of 2026-03-07
```

W12 メトリクス継続:

```bash
node scripts/collect-poc-metrics.mjs --week 2026-W12 --user-data-dir /tmp/iagent-metrics-profile --seed-sample
```

関連テスト:

```bash
npm test -- src/components/MessageBubble.test.tsx src/components/HeartbeatPanel.test.tsx src/components/FeedPanel.test.tsx src/components/SettingsModal.test.tsx src/hooks/useHeartbeatPanel.test.ts src/hooks/useFeedPanel.test.ts src/core/contextSnapshot.test.ts src/core/autonomyEvent.test.ts src/core/autonomyDiagnostics.test.ts src/core/heartbeatCapabilities.test.ts src/core/heartbeatNotificationText.test.ts src/core/notifier.test.ts src/core/swHandlers.test.ts src/store/heartbeatStore.test.ts src/core/heartbeatCommon.test.ts src/core/heartbeat.test.ts src/App.test.tsx
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

W12 ユーザー検証の同期:

```bash
node scripts/sync-poc-validation.mjs --week 2026-W12
```

---

## 6. 環境メモ

- WSL 側 `node` は `v18.19.1`
- Windows 側 `node` は `v22.21.1`
- 依存関係が Linux 向け `node_modules` 前提なので、Windows 側 `vitest` は `rollup` optional dependency 不整合で失敗する
- 型確認は WSL で `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit` が通る
