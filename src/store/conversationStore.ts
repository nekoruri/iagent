import { openDB, type IDBPDatabase } from 'idb';
import type { ChatMessage } from '../types';

const DB_NAME = 'iagent-db';
const STORE_NAME = 'conversations';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('calendar')) {
          const calStore = db.createObjectStore('calendar', { keyPath: 'id' });
          calStore.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function loadMessages(): Promise<ChatMessage[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function saveMessage(message: ChatMessage): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, message);
}

export async function clearMessages(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}
