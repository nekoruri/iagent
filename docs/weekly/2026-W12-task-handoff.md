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

参照:

- `docs/weekly/2026-W11.md`
- `docs/weekly/2026-W11-check-strict-2026-03-07.json`
- `docs/weekly/interviews/2026-W11-info-collector.md`

---

## 2. 次にやること

1. 固定プロファイルで W12 メトリクスを継続計測し、UI 改善後の数値変化を観測する
2. PM型 / 学習者型インタビューを予定どおり実施し、必要なら情報収集型も再観測する
3. `docs/weekly/2026-W12.md` に定性所見を反映し、次週へ回す改善タスクを最大 3 件まで整理する

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

---

## 4. 残作業の優先順

1. PM型 / 学習者型インタビュー
2. W12 メトリクス継続計測
3. 週次レビュー反映と次週タスク起票

理由:

- 実装タスクは完了したため、残る不確実性は定性検証と継続計測に移った
- W11 の warning 解消には PM型 / 学習者型インタビュー完了が必須
- W12 の改善継続判断は、数値と interview の両方が揃ってから行うほうが精度が高い

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
npm test -- src/components/TaskProgress.test.tsx src/components/HeartbeatPanel.test.tsx src/components/SettingsModal.test.tsx
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
