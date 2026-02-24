import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetStores } from './__mocks__/db';

vi.mock('./db');

import { saveConfigToIDB, loadConfigFromIDB } from './configStore';
import type { AppConfig } from '../types';

function makeConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    openaiApiKey: 'sk-test',
    braveApiKey: '',
    openWeatherMapApiKey: '',
    mcpServers: [],
    heartbeat: {
      enabled: true,
      intervalMinutes: 30,
      quietHoursStart: 0,
      quietHoursEnd: 6,
      tasks: [],
      desktopNotification: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  __resetStores();
});

describe('saveConfigToIDB / loadConfigFromIDB', () => {
  it('保存した設定を読み取れる', async () => {
    const config = makeConfig({ openaiApiKey: 'sk-saved' });
    await saveConfigToIDB(config);

    const loaded = await loadConfigFromIDB();
    expect(loaded).not.toBeNull();
    expect(loaded!.openaiApiKey).toBe('sk-saved');
    expect(loaded!.heartbeat?.enabled).toBe(true);
  });

  it('未保存の場合 null を返す', async () => {
    const loaded = await loadConfigFromIDB();
    expect(loaded).toBeNull();
  });

  it('上書き保存で最新値が返る', async () => {
    await saveConfigToIDB(makeConfig({ openaiApiKey: 'sk-old' }));
    await saveConfigToIDB(makeConfig({ openaiApiKey: 'sk-new' }));

    const loaded = await loadConfigFromIDB();
    expect(loaded!.openaiApiKey).toBe('sk-new');
  });

  it('mcpServers の配列も正しく保存される', async () => {
    const config = makeConfig({
      mcpServers: [
        { id: '1', name: 'server1', url: 'http://localhost:3000', enabled: true },
      ],
    });
    await saveConfigToIDB(config);

    const loaded = await loadConfigFromIDB();
    expect(loaded!.mcpServers).toHaveLength(1);
    expect(loaded!.mcpServers[0].name).toBe('server1');
  });
});
