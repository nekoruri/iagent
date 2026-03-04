# PoC 指標の収集手順

作成日: 2026-03-05  
目的: `docs/POC-KPI.md` の 3 指標を毎週同じ方法で収集する。

---

## 前提

- 開発サーバーが起動していること（例: `npm run dev`）
- 対象DB: `iagent-db`

---

## 推奨: 週次一括コマンド（項目 1 / 2 / 4）

週次運用は、以下 1 コマンドで実行できる:

```bash
npm run poc:run-week -- --week 2026-W11 --user-data-dir /tmp/iagent-metrics-profile
```

週次レビューを締めるときは、strict + 最終チェック込みの別名コマンドを使う:

```bash
npm run poc:close-week -- --week 2026-W11 --user-data-dir /tmp/iagent-metrics-profile
```

実行内容:

1. `poc:init-week`（雛形作成）
2. `metrics:poc`（KPI/SLO を週次レビュー + baseline に反映）
3. `poc:sync-validation`（インタビュー結果を週次レビューに反映）

補足:

- `--skip-metrics` / `--skip-validation` で段階実行できる
- `--weekly-dir` 指定時は対象ディレクトリへ出力される
- `--strict` を付けると KPI/SLO のいずれかが `Action` の場合に非0終了する
- `--check --check-strict` を付けると、実行後に週次記入漏れを自動検証できる
- `--check-report-json <path>` を付けると、最終チェックの結果を JSON 保存できる
- `--check-as-of <YYYY-MM-DD>` を付けると、インタビュー必須チェックの基準日を指定できる
- 実行後は `npm run poc:check-week -- --week <week> --strict` で記入漏れチェック推奨

---

## GitHub Actions（手動実行）

GitHub Actions の `PoC Week Check` workflow から、`poc:check-week` を手動実行できる。

入力:

- `week`（必須）
- `strict`
- `require_interviews`
- `as_of`

実行後、チェック結果 JSON は artifact `poc-week-check-<week>` として保存される。

---

## 推奨: 自動収集コマンド（Playwright）

手動スニペットより先に、以下コマンドで KPI を取得できる:

```bash
npm run metrics:poc
```

オプション例:

```bash
npm run metrics:poc -- --url http://localhost:5173 --days 7
npm run metrics:poc -- --url http://localhost:5173 --days 7 --user-data-dir /tmp/iagent-metrics-profile
npm run metrics:poc -- --week 2026-W10 --user-data-dir /tmp/iagent-metrics-profile
npm run metrics:poc -- --url http://localhost:5173 --days 7 --user-data-dir /tmp/iagent-metrics-profile --weekly-review docs/weekly/2026-W10.md
npm run metrics:poc -- --url http://localhost:5173 --days 7 --user-data-dir /tmp/iagent-metrics-profile --baseline docs/weekly/2026-W10-baseline.md
npm run metrics:poc -- --week 2026-W10 --fail-on-action
```

出力された `Markdown Paste Helper` を `docs/weekly/2026-W10-baseline.md` に転記する。

`--week` を指定すると、以下を自動解決する:

- `--weekly-review docs/weekly/<week>.md`
- `--baseline docs/weekly/<week>-baseline.md`

例:

```bash
npm run metrics:poc -- --week 2026-W10 --user-data-dir /tmp/iagent-metrics-profile
```

※ `--weekly-review` / `--baseline` を明示した場合は、明示値を優先する。
※ 解決先ファイルが未作成の場合はテンプレートから自動生成する。
※ `--fail-on-action` 指定時は、KPI/SLO の overall 判定に `Action` を含むと exit code 2 で終了する。

`--weekly-review` を指定すると、週次レビューMarkdownの以下行を自動更新する:

- `レビュー日`
- `提案 Accept 率（7日）`
- `7日アクティブ率`
- `通知経由再訪率（7日）`
- `KPI 判定`
- `Heartbeat 実行成功率（24h平均）`
- `Push wake 実行成功率（24h平均）`
- `Heartbeat 遅延 p95（24h平均）`
- `SLO 判定`

`--baseline` を指定すると、baselineファイルの以下を自動更新する:

- 実施ログ（`- 実施日:` に最新実行を追記）
- KPI Baseline 各項目
- SLO Baseline 各項目

生成テンプレート:

- 週次レビュー: `docs/templates/WEEKLY-REVIEW.md`
- baseline: `docs/templates/WEEKLY-BASELINE.md`

注意:

- デフォルト実行は一時プロファイルを使うため、既存ブラウザの利用データは含まれない。
- 継続観測する場合は `--user-data-dir` を固定して実行する。

---

## 手動収集（DevTools）

自動コマンドを使わない場合は、以下スニペットで手動集計する。

---

## KPI 1: 提案 Accept 率（7日）

下記スニペットを Console で実行:

```javascript
(() => {
  const DAY = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - 7 * DAY;
  const req = indexedDB.open('iagent-db');
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('heartbeat', 'readonly');
    const getReq = tx.objectStore('heartbeat').get('state');
    getReq.onsuccess = () => {
      const results = getReq.result?.recentResults ?? [];
      let accepted = 0;
      let dismissed = 0;
      let snoozed = 0;
      for (const r of results) {
        if (r.timestamp < cutoff || !r.feedback) continue;
        if (r.feedback.type === 'accepted') accepted++;
        if (r.feedback.type === 'dismissed') dismissed++;
        if (r.feedback.type === 'snoozed') snoozed++;
      }
      const total = accepted + dismissed + snoozed;
      const rate = total > 0 ? accepted / total : 0;
      console.table([{ accepted, dismissed, snoozed, total, acceptRate: rate }]);
      db.close();
    };
  };
})();
```

---

## KPI 2: 7日アクティブ率

定義（PoC）:  
「直近 7 日で、`ユーザーメッセージ送信` または `Heartbeat フィードバック操作` があった日数 / 7」

```javascript
(() => {
  const DAY = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - 7 * DAY;
  const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
  const activeDays = new Set();

  const req = indexedDB.open('iagent-db');
  req.onsuccess = () => {
    const db = req.result;

    // conversations からユーザーメッセージ日を集計
    const tx1 = db.transaction('conversations', 'readonly');
    const getAllMsg = tx1.objectStore('conversations').getAll();
    getAllMsg.onsuccess = () => {
      const msgs = getAllMsg.result ?? [];
      for (const m of msgs) {
        if (m.timestamp >= cutoff && m.role === 'user') {
          activeDays.add(dayKey(m.timestamp));
        }
      }

      // heartbeat feedback 日を集計
      const tx2 = db.transaction('heartbeat', 'readonly');
      const getState = tx2.objectStore('heartbeat').get('state');
      getState.onsuccess = () => {
        const results = getState.result?.recentResults ?? [];
        for (const r of results) {
          const fbTs = r.feedback?.timestamp;
          if (fbTs && fbTs >= cutoff) activeDays.add(dayKey(fbTs));
        }
        const activeRate = activeDays.size / 7;
        console.table([{ activeDays: activeDays.size, activeRate, days: [...activeDays].sort() }]);
        db.close();
      };
    };
  };
})();
```

---

## KPI 3: 通知経由の再訪率（7日）

- 定義: `通知表示（shown）に紐づいたクリック数 / 通知表示数`
- 取得元: `heartbeat` ストアの `ops-events` 行
- 対象イベント:
  - 表示: `type = notification-shown`
  - クリック: `type = notification-clicked`
- 補足:
  - `notificationId` で shown/clicked を突合する
  - shown に対応しない click は `unmatchedClicks` として別カウント（分母には含めない）

```javascript
(() => {
  const DAY = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - 7 * DAY;
  const req = indexedDB.open('iagent-db');
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('heartbeat', 'readonly');
    const getReq = tx.objectStore('heartbeat').get('ops-events');
    getReq.onsuccess = () => {
      const events = getReq.result?.events ?? [];
      const shownIds = new Set();
      let shown = 0;
      let clicked = 0;
      let unmatchedClicks = 0;
      for (const e of events) {
        if (typeof e.timestamp !== 'number' || e.timestamp < cutoff) continue;
        if (e.type === 'notification-shown') {
          shown++;
          if (typeof e.notificationId === 'string' && e.notificationId) {
            shownIds.add(e.notificationId);
          }
        }
      }
      const clickedIds = new Set();
      for (const e of events) {
        if (typeof e.timestamp !== 'number' || e.timestamp < cutoff) continue;
        if (e.type !== 'notification-clicked') continue;
        const id = typeof e.notificationId === 'string' ? e.notificationId : '';
        if (id && shownIds.has(id) && !clickedIds.has(id)) {
          clicked++;
          clickedIds.add(id);
        } else if (!id || !shownIds.has(id)) {
          unmatchedClicks++;
        }
      }
      const revisitRate = shown > 0 ? clicked / shown : 0;
      console.table([{ notificationShown: shown, notificationClicked: clicked, unmatchedClicks, revisitRate }]);
      db.close();
    };
  };
})();
```

---

## SLO 収集（自動）

`npm run metrics:poc` は以下の 24h SLO を同時に出力する:

- Heartbeat 実行成功率: `slo24h.heartbeatRunSuccess.rate`
- Push wake 実行成功率: `slo24h.pushWakeSuccess.rate`
- Heartbeat 処理遅延 p95: `slo24h.heartbeatDurationP95.p95Ms`

取得元は `heartbeat` ストアの `ops-events`（`type = heartbeat-run`）。

週次レビューには `Markdown Paste Helper` の下記項目を転記する:

- `slo24hHeartbeatSuccessRate`
- `slo24hPushSuccessRate`
- `slo24hHeartbeatP95Ms` / `slo24hHeartbeatP95Sec`

---

## 判定（Good / Watch / Action / NoData）

`npm run metrics:poc` は KPI/SLO の判定も自動で出力する。

転記対象:

- KPI:
  - `kpiAcceptStatus`
  - `kpiActiveStatus`
  - `kpiRevisitStatus`
  - `kpiOverallStatus`
- SLO:
  - `slo24hHeartbeatStatus`
  - `slo24hPushStatus`
  - `slo24hLatencyStatus`
  - `slo24hOverallStatus`

補足:

- `NoData` は「計測対象サンプルが不足（attempts/sample=0）」を表す
- KPI は利用実績ゼロでも `Action` 判定になり得る（PoC では運用上の改善シグナルとして扱う）
