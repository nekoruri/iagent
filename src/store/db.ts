import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'iagent-db';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('calendar')) {
          const calStore = db.createObjectStore('calendar', { keyPath: 'id' });
          calStore.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('conversations')) {
          db.createObjectStore('conversations', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('heartbeat')) {
          db.createObjectStore('heartbeat', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}
