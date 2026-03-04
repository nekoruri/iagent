# PoC 指標の収集手順

作成日: 2026-03-05  
目的: `docs/POC-KPI.md` の 3 指標を毎週同じ方法で収集する。

---

## 前提

- 開発サーバーが起動していること（例: `npm run dev`）
- 対象DB: `iagent-db`

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
```

出力された `Markdown Paste Helper` を `docs/weekly/2026-W10-baseline.md` に転記する。

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

現状は厳密トラッキング未実装のため、PoC 期間は暫定 proxy を使う。

- proxy 定義: `feedback が付いた hasChanges 通知数 / hasChanges 通知総数`
- 注意: 通知クリック起因かを厳密に区別できないため、参考値として扱う

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
      let totalHasChanges = 0;
      let hasFeedback = 0;
      for (const r of results) {
        if (r.timestamp < cutoff || !r.hasChanges) continue;
        totalHasChanges++;
        if (r.feedback) hasFeedback++;
      }
      const proxyRate = totalHasChanges > 0 ? hasFeedback / totalHasChanges : 0;
      console.table([{ totalHasChanges, hasFeedback, proxyRevisitRate: proxyRate }]);
      db.close();
    };
  };
})();
```

---

## SLO 収集（暫定）

PoC 期間はまず運用ログから週次確認:

1. Heartbeat 例外ログ件数  
2. push/periodic 実行失敗ログ件数  
3. 明らかな遅延ケース（体感 45 秒超）の件数  

SLO を数値自動化する場合は、次フェーズでイベントカウンタを実装する。
