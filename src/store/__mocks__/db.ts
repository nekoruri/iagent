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
    // traces ストアは traceId がキーパス
    const key = (value as Record<string, unknown>).traceId ??
                (value as Record<string, unknown>).key ??
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
  getAllFromIndex(storeName: string, indexName: string, query?: string | number) {
    const store = getStore(storeName);
    if (query !== undefined) {
      const filtered = [...store.values()].filter((v) => {
        return (v as Record<string, unknown>)[indexName] === query;
      });
      return Promise.resolve(filtered.map((v) => structuredClone(v)));
    }
    return Promise.resolve([...store.values()].map((v) => structuredClone(v)));
  },
  /** transaction モック — objectStore ベースの操作をサポート */
  transaction(storeNames: string | string[], _mode?: string) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    function makeStoreAccessor(name: string) {
      const store = getStore(name);
      return {
        put(value: Record<string, unknown>) {
          const key = (value as Record<string, unknown>).traceId ??
                      (value as Record<string, unknown>).key ??
                      (value as Record<string, unknown>).id;
          store.set(key as string | number, structuredClone(value));
        },
        get(key: string | number) {
          return Promise.resolve(store.get(key) ?? undefined);
        },
        getAll() {
          return Promise.resolve([...store.values()].map((v) => structuredClone(v)));
        },
        delete(key: string | number) {
          store.delete(key);
        },
        index(idxName: string) {
          return {
            getAll(query?: IDBKeyRange | string | number) {
              if (query === undefined) {
                return Promise.resolve([...store.values()].map((v) => structuredClone(v)));
              }
              const queryValue = (typeof globalThis.IDBKeyRange !== 'undefined' && query instanceof IDBKeyRange)
                ? (query as unknown as { _value: unknown })._value : query;
              const values = [...store.values()].filter((v) => {
                return (v as Record<string, unknown>)[idxName] === queryValue;
              });
              return Promise.resolve(values.map((v) => structuredClone(v)));
            },
          };
        },
      };
    }
    const tx = {
      objectStore(name: string) {
        if (!names.includes(name)) throw new Error(`Store "${name}" not in transaction`);
        return makeStoreAccessor(name);
      },
      // idb の単一ストアトランザクション用ショートカット
      store: makeStoreAccessor(names[0]),
      done: Promise.resolve(),
    };
    return tx;
  },
};

export function getDB() {
  return Promise.resolve(mockDB);
}
