import { describe, expect, it, vi } from 'vitest';
import { listAllSubscriptionKeys, processInBatches } from './index';

function createPagedSubscriptionKv(pages: Array<{
  keys: Array<{ name: string }>;
  list_complete: boolean;
  cursor?: string;
}>): KVNamespace {
  let callIndex = 0;
  return {
    list: vi.fn(async () => pages[callIndex++] ?? { keys: [], list_complete: true, cursor: '' }),
  } as unknown as KVNamespace;
}

describe('listAllSubscriptionKeys', () => {
  it('list_complete=true まで KV list を繰り返して全キーを返す', async () => {
    const kv = createPagedSubscriptionKv([
      {
        keys: [{ name: 'sub:a' }, { name: 'sub:b' }],
        list_complete: false,
        cursor: 'page-2',
      },
      {
        keys: [{ name: 'sub:c' }],
        list_complete: true,
        cursor: '',
      },
    ]);

    const result = await listAllSubscriptionKeys(kv);

    expect(result).toEqual([{ name: 'sub:a' }, { name: 'sub:b' }, { name: 'sub:c' }]);
    expect(kv.list).toHaveBeenNthCalledWith(1, { prefix: 'sub:', cursor: undefined });
    expect(kv.list).toHaveBeenNthCalledWith(2, { prefix: 'sub:', cursor: 'page-2' });
  });

  it('空ページでも安全に終了する', async () => {
    const kv = createPagedSubscriptionKv([
      {
        keys: [],
        list_complete: true,
        cursor: '',
      },
    ]);

    const result = await listAllSubscriptionKeys(kv);

    expect(result).toEqual([]);
    expect(kv.list).toHaveBeenCalledTimes(1);
  });
});

describe('processInBatches', () => {
  it('指定サイズごとに逐次処理し、同時実行数を制限する', async () => {
    let running = 0;
    let maxRunning = 0;

    const result = await processInBatches([1, 2, 3, 4, 5], 2, async (value) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await Promise.resolve();
      running--;
      return value * 10;
    });

    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(result).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 20 },
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 40 },
      { status: 'fulfilled', value: 50 },
    ]);
  });

  it('batchSize が 0 以下でも 1 件ずつ処理する', async () => {
    const result = await processInBatches(['a', 'b'], 0, async (value) => value.toUpperCase());

    expect(result).toEqual([
      { status: 'fulfilled', value: 'A' },
      { status: 'fulfilled', value: 'B' },
    ]);
  });
});
