import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'iagent-db';
const DB_VERSION = 6;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
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
        if (!db.objectStoreNames.contains('memories')) {
          const memStore = db.createObjectStore('memories', { keyPath: 'id' });
          memStore.createIndex('category', 'category', { unique: false });
          memStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('traces')) {
          const traceStore = db.createObjectStore('traces', { keyPath: 'traceId' });
          traceStore.createIndex('startTime', 'startTime', { unique: false });
          traceStore.createIndex('exported', 'exported', { unique: false });
        }
        if (!db.objectStoreNames.contains('conversation-meta')) {
          const convMetaStore = db.createObjectStore('conversation-meta', { keyPath: 'id' });
          convMetaStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        // conversations ストアに conversationId インデックス追加
        if (db.objectStoreNames.contains('conversations')) {
          const convStore = transaction.objectStore('conversations');
          if (!convStore.indexNames.contains('conversationId')) {
            convStore.createIndex('conversationId', 'conversationId', { unique: false });
          }
        }
      },
      blocked() {
        // 他のタブが古いバージョンのDBを開いている場合
        console.warn('[iAgent DB] アップグレードが他のタブによりブロックされています。他のタブを閉じてリロードしてください。');
        dbPromise = null;
      },
      blocking() {
        // このタブが他のタブのアップグレードをブロックしている場合
        console.warn('[iAgent DB] 他のタブがDBアップグレードを要求しています。');
      },
      terminated() {
        // DB接続が予期せず閉じた場合
        console.warn('[iAgent DB] DB接続が切断されました。再接続します。');
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}
