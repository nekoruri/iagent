/**
 * インメモリ Map ベースの IndexedDB モック
 * Vitest Manual Mocks: vi.mock('./db') で自動適用される
 */

type StoreData = Map<string | number, Record<string, unknown>>;
const stores = new Map<string, StoreData>();

function getStore(name: string): StoreData {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
}

/** テスト間でデータをリセット */
export function __resetStores(): void {
  stores.clear();
}

const mockDB = {
  get(storeName: string, key: string | number) {
    return Promise.resolve(getStore(storeName).get(key) ?? undefined);
  },
  put(storeName: string, value: Record<string, unknown>) {
    const store = getStore(storeName);
    const key = (value as Record<string, unknown>).key ??
                (value as Record<string, unknown>).id;
    store.set(key as string | number, structuredClone(value));
    return Promise.resolve();
  },
  getAll(storeName: string) {
    return Promise.resolve([...getStore(storeName).values()].map((v) => structuredClone(v)));
  },
  clear(storeName: string) {
    getStore(storeName).clear();
    return Promise.resolve();
  },
  delete(storeName: string, key: string | number) {
    getStore(storeName).delete(key);
    return Promise.resolve();
  },
  getAllKeys(storeName: string) {
    return Promise.resolve([...getStore(storeName).keys()]);
  },
  getAllFromIndex(storeName: string, _indexName: string, query?: string | number) {
    const store = getStore(storeName);
    if (query !== undefined) {
      const filtered = [...store.values()].filter((v) => {
        return Object.values(v as Record<string, unknown>).includes(query);
      });
      return Promise.resolve(filtered.map((v) => structuredClone(v)));
    }
    return Promise.resolve([...store.values()].map((v) => structuredClone(v)));
  },
};

export function getDB() {
  return Promise.resolve(mockDB);
}
