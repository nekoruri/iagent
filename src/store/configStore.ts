import { getDB } from './db';
import type { AppConfig } from '../types';

const STORE_NAME = 'config';
const CONFIG_KEY = 'app-config';

/** IndexedDB に設定を保存する（Worker 向け） */
export async function saveConfigToIDB(config: AppConfig): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, { key: CONFIG_KEY, ...config });
}

/** IndexedDB から設定を読み取る（Worker 向け） */
export async function loadConfigFromIDB(): Promise<AppConfig | null> {
  const db = await getDB();
  const row = await db.get(STORE_NAME, CONFIG_KEY);
  if (!row) return null;
  // keyPath の 'key' フィールドを除いて返す
  const rest = { ...row as Record<string, unknown> };
  delete rest.key;
  return rest as unknown as AppConfig;
}
