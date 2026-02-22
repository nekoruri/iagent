import { openDB, type IDBPDatabase } from 'idb';
import type { CalendarEvent } from '../types';

const DB_NAME = 'iagent-db';
const STORE_NAME = 'calendar';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

export async function listEvents(date?: string): Promise<CalendarEvent[]> {
  const db = await getDB();
  if (date) {
    return db.getAllFromIndex(STORE_NAME, 'date', date);
  }
  return db.getAll(STORE_NAME);
}

export async function createEvent(event: Omit<CalendarEvent, 'id' | 'createdAt'>): Promise<CalendarEvent> {
  const db = await getDB();
  const newEvent: CalendarEvent = {
    ...event,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await db.put(STORE_NAME, newEvent);
  return newEvent;
}

export async function deleteEvent(id: string): Promise<boolean> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id);
  if (!existing) return false;
  await db.delete(STORE_NAME, id);
  return true;
}
