# テスト体制強化レポート

> 実施日: 2026-03-02
> 対象: iAgent クライアントのテスト基盤全体

---

## 概要

プロジェクトの機能複雑化に伴い、テスト体制を 3 セッションに分けて段階的に強化した。
SW ロジック抽出・ユニットテスト空白解消・E2E テスト拡充・CI 統合を実施し、
テスト総数を **690 → 828**（ユニット）、**16 → 27**（E2E）に拡大した。

---

## Before / After

| 指標 | Before | After |
|---|---|---|
| ユニットテスト | 690 テスト / 48 ファイル | **828 テスト / 58 ファイル** |
| E2E テスト | 16 テスト / 5 spec | **27 テスト / 8 spec** |
| カバレッジ（Statements） | 86.45% | **86.41%**（対象拡大により微減） |
| カバレッジ対象 | core/store/telemetry | **+ tools/hooks** |
| CI E2E ジョブ | 通常 E2E のみ | **+ Push E2E 統合ジョブ** |

---

## Session A: SW ロジック抽出 + Worker テスト

### 目的
Service Worker / Dedicated Worker のロジックをユニットテスト可能にする。

### 成果

| ファイル | 内容 | テスト数 |
|---|---|---|
| `src/core/swHandlers.ts` | sw.ts からのロジック抽出（handlePush, handlePeriodicSync, handleNotificationClick 等） | — |
| `src/core/swHandlers.test.ts` | Push ハンドラ、Periodic Sync、通知クリック、IDB 設定読取り | 39 |
| `src/workers/heartbeat.worker.test.ts` | start/stop/run-now/update-config コマンド、tick 実行条件、quiet hours | 30 |

**テスト増分**: +69 テスト（690 → 739）

---

## Session B: ユニットテスト空白解消

### 目的
ツール定義とフックの未テスト領域を埋める。

### ツール定義テスト（5 ファイル）

| ファイル | テスト数 | 主なテスト観点 |
|---|---|---|
| `calendarTool.test.ts` | 11 | list/create/create_reminder アクション、バリデーション |
| `memoryTool.test.ts` | 18 | save/search/list/delete、8 カテゴリ、importance/tags |
| `webSearchTool.test.ts` | 7 | API キーあり/なし、HTTP エラー、fetch 例外 |
| `deviceInfoTool.test.ts` | 13 | Battery/Geolocation/Weather API モック |
| `heartbeatFeedTools.test.ts` | 10 | 5 つの feed ツールが executeWorkerTool を正しく委譲 |

### フックテスト（2 ファイル）

| ファイル | テスト数 | 主なテスト観点 |
|---|---|---|
| `useHeartbeatPanel.test.ts` | 16 | パネル開閉、未読カウント、markAsRead、togglePin、sendFeedback |
| `useAgentChat.test.ts` | 14 | ストリーミング、ツール呼び出し、abort、エラー、テレメトリ |

**テスト増分**: +89 テスト（739 → 828）

### 技術的知見

- `@openai/agents` SDK の `tool()` は `.invoke(runContext, jsonString)` パターン（`.execute()` ではない）
- `useAgentChat` の初期 `loadMessages` useEffect とテスト内 `sendMessage` のレースコンディション → `setupHook()` ヘルパーで初期ロード完了を待機

---

## Session C: E2E テスト拡充 + インフラ改善

### テストインフラ改善

| 変更 | 内容 |
|---|---|
| `vitest.config.ts` | カバレッジ対象に `tools/**` と `hooks/**` を追加 |
| `e2e/fixtures/api-mocks.ts` | `createSSEResponseWithToolCall()` — ツール呼び出し SSE モック（12 イベント） |
| `e2e/fixtures/test-helpers.ts` | `waitForStreamingComplete()`, `injectHeartbeatResults()` 追加 |

### E2E テスト新規作成

| spec ファイル | テスト数 | テスト内容 |
|---|---|---|
| `chat-streaming.spec.ts` | 4 | 基本ストリーミング、連続送信、Markdown レンダリング、送信ボタン状態 |
| `tool-execution.spec.ts` | 2 | calendar / web_search ツール呼び出し → テキスト応答 |
| `heartbeat-panel.spec.ts` | 5 | ベル開閉、空メッセージ、結果一覧、未読バッジ、既読マーク |

**E2E テスト増分**: +11 テスト（16 → 27）

### CI 統合

- `.github/workflows/ci.yml` に `e2e-push` ジョブを追加（PR 時に通常 E2E と並列実行）

### 技術的知見: Heartbeat パネル E2E の IDB シード問題

**問題**: `page.evaluate()` による IDB 注入が "Execution context was destroyed" エラーで失敗。VitePWA `registerType: 'autoUpdate'` + Worker 初期化による navigation context 破壊が原因。

**試行した手段**:
1. `page.waitForLoadState('networkidle')` → heartbeat polling でタイムアウト
2. `page.waitForLoadState('domcontentloaded')` + `waitForTimeout` → 依然 context 破壊
3. `page.addInitScript` → IDB 非同期のためデータがアプリ読取り前に完了しない
4. `heartbeat.enabled: false` + `page.evaluate` → bell アイコン自体が非表示に

**解決策**: `page.addInitScript` で IDB をバージョン 1 で作成し heartbeat store にデータをシード → アプリ側のバージョン 10 アップグレードで他ストアが追加されつつ heartbeat データは保持される。

```typescript
function seedHeartbeatResults(page, results) {
  return page.addInitScript((data) => {
    const request = indexedDB.open('iagent-db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('heartbeat')) {
        db.createObjectStore('heartbeat', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('heartbeat', 'readwrite');
      tx.objectStore('heartbeat').put({
        key: 'state', lastChecked: Date.now(), recentResults: data,
      });
      tx.oncomplete = () => db.close();
    };
  }, results);
}
```

---

## 新規テストファイル一覧

### ユニットテスト（10 ファイル）
```
src/core/swHandlers.test.ts          (39 テスト)
src/workers/heartbeat.worker.test.ts (30 テスト)
src/tools/calendarTool.test.ts       (11 テスト)
src/tools/memoryTool.test.ts         (18 テスト)
src/tools/webSearchTool.test.ts       (7 テスト)
src/tools/deviceInfoTool.test.ts     (13 テスト)
src/tools/heartbeatFeedTools.test.ts (10 テスト)
src/hooks/useHeartbeatPanel.test.ts  (16 テスト)
src/hooks/useAgentChat.test.ts       (14 テスト)
```

### E2E テスト（3 ファイル）
```
e2e/chat-streaming.spec.ts    (4 テスト)
e2e/tool-execution.spec.ts    (2 テスト)
e2e/heartbeat-panel.spec.ts   (5 テスト)
```

### リファクタリング（1 ファイル）
```
src/core/swHandlers.ts  — sw.ts からのロジック抽出
```

---

## 今後の改善候補

- [ ] Visual Regression テスト（Playwright スクリーンショット比較）
- [ ] E2E: ストリーミング中の停止ボタン（abort）テスト
- [ ] E2E: Heartbeat パネルのピン留め/フィードバック操作テスト
- [ ] E2E: Push 受信エラー時のエラー通知テスト
- [ ] useAgentChat: MCP ツール呼び出しフローのテスト
- [ ] カバレッジ: components/** を対象に追加

---

## 関連

- 計画ファイル: `.claude/plans/polymorphic-dreaming-pike.md`
- ROADMAP 更新: `docs/ROADMAP.md`「テスト品質の継続改善」セクション
