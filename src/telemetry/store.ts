import { getDB } from '../store/db';
import type { TraceRecord } from './types';

const STORE_NAME = 'traces';
const MAX_TRACES = 200;

/** トレースを保存し、上限を超えた場合は古いものを削除 */
export async function saveTrace(record: TraceRecord): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, record);
  await enforceLimit(db);
}

/** トレース一覧を新しい順に取得 */
export async function listTraces(limit = 50): Promise<TraceRecord[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME) as TraceRecord[];
  all.sort((a, b) => b.startTime - a.startTime);
  return all.slice(0, limit);
}

/** 特定のトレースを取得 */
export async function getTrace(traceId: string): Promise<TraceRecord | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, traceId) as Promise<TraceRecord | undefined>;
}

/** 未エクスポートのトレースを取得 */
export async function getUnexportedTraces(limit = 10): Promise<TraceRecord[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME) as TraceRecord[];
  return all
    .filter((r) => !r.exported)
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, limit);
}

/** 指定トレースをエクスポート済みにマーク */
export async function markExported(traceIds: string[]): Promise<void> {
  const db = await getDB();
  for (const id of traceIds) {
    const record = await db.get(STORE_NAME, id) as TraceRecord | undefined;
    if (record) {
      record.exported = true;
      await db.put(STORE_NAME, record);
    }
  }
}

/** 全トレースを削除 */
export async function clearTraces(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

/** 保存上限を超えた場合に古いトレースを削除 */
async function enforceLimit(db: Awaited<ReturnType<typeof getDB>>): Promise<void> {
  const all = await db.getAll(STORE_NAME) as TraceRecord[];
  if (all.length <= MAX_TRACES) return;

  all.sort((a, b) => a.startTime - b.startTime);
  const toDelete = all.slice(0, all.length - MAX_TRACES);
  for (const record of toDelete) {
    await db.delete(STORE_NAME, record.traceId);
  }
}
