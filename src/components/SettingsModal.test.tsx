import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from './SettingsModal';

// config モック
vi.mock('../core/config', () => ({
  getConfig: vi.fn(() => ({
    openaiApiKey: '',
    braveApiKey: '',
    openWeatherMapApiKey: '',
    mcpServers: [],
    heartbeat: {
      enabled: false,
      intervalMinutes: 30,
      quietHoursStart: 0,
      quietHoursEnd: 6,
      tasks: [],
      desktopNotification: false,
    },
    otel: {
      enabled: false,
      endpoint: '/api/otel',
      headers: {},
      batchSize: 10,
      flushIntervalMs: 30000,
    },
  })),
  saveConfig: vi.fn(),
  getDefaultHeartbeatConfig: vi.fn(() => ({
    enabled: false,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    tasks: [],
    desktopNotification: false,
  })),
  getDefaultOtelConfig: vi.fn(() => ({
    enabled: false,
    endpoint: '/api/otel',
    headers: {},
    batchSize: 10,
    flushIntervalMs: 30000,
  })),
  getDefaultProxyConfig: vi.fn(() => ({
    enabled: false,
    serverUrl: '',
    authToken: '',
    allowedDomains: [],
  })),
  getDefaultPersonaConfig: vi.fn(() => ({
    name: 'iAgent',
    personality: '',
    tone: '',
    customInstructions: '',
  })),
  BUILTIN_HEARTBEAT_TASKS: [],
}));

// corsProxy モック
vi.mock('../core/corsProxy', () => ({
  registerProxyToken: vi.fn(async () => 'mock-token'),
}));

// toolUtils モック（isReadOnlyTool）
vi.mock('../core/toolUtils', () => ({
  isReadOnlyTool: vi.fn((name: string) => {
    const prefixes = ['list_', 'get_', 'search_', 'read_'];
    return prefixes.some((p) => name.startsWith(p));
  }),
}));

// mcpManager モック
vi.mock('../core/mcpManager', () => ({
  mcpManager: {
    subscribe: vi.fn(() => vi.fn()),
    syncWithConfig: vi.fn(async () => {}),
    getStatus: vi.fn(() => 'disconnected'),
    getError: vi.fn(() => null),
    getAvailableTools: vi.fn(async () => []),
  },
}));

// notifier モック
vi.mock('../core/notifier', () => ({
  getNotificationPermission: vi.fn(() => 'default'),
  requestNotificationPermission: vi.fn(async () => 'granted'),
}));

function mockStorage(opts: { persisted: boolean; usage: number; quota: number }) {
  Object.defineProperty(navigator, 'storage', {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => opts.persisted),
      estimate: vi.fn(async () => ({ usage: opts.usage, quota: opts.quota })),
    },
    writable: true,
    configurable: true,
  });
}

function removeStorage() {
  Object.defineProperty(navigator, 'storage', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // App.tsx の OS テーマリスナーが matchMedia を使用するためモックが必要
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    // デフォルトのストレージモック
    mockStorage({ persisted: true, usage: 50 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 });
  });

  it('open=false のとき何もレンダリングされない', () => {
    const { container } = render(<SettingsModal open={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('open=true のとき設定モーダルが表示される', () => {
    render(<SettingsModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('設定')).toBeInTheDocument();
  });

  it('API キーを入力できる', async () => {
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    const openaiInput = screen.getByPlaceholderText('sk-...');
    await userEvent.type(openaiInput, 'sk-test-key');
    expect(openaiInput).toHaveValue('sk-test-key');
  });

  it('保存ボタンで saveConfig と onClose が呼ばれる', async () => {
    const { saveConfig } = await import('../core/config');
    const onClose = vi.fn();
    render(<SettingsModal open={true} onClose={onClose} />);

    await userEvent.click(screen.getByText('保存'));

    expect(saveConfig).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('キャンセルボタンで onClose が呼ばれる（saveConfig は呼ばれない）', async () => {
    const { saveConfig } = await import('../core/config');
    const onClose = vi.fn();
    render(<SettingsModal open={true} onClose={onClose} />);

    await userEvent.click(screen.getByText('キャンセル'));

    expect(onClose).toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('MCP サーバーの追加ボタンでサーバーフォームが表示される', async () => {
    const { container } = render(<SettingsModal open={true} onClose={vi.fn()} />);

    expect(screen.getByText('MCPサーバーが未登録です')).toBeInTheDocument();

    // MCP Servers セクション内の「+ 追加」ボタンをクリック（エージェント設定の次のセクション）
    const mcpSections = container.querySelectorAll('.mcp-section');
    // MCP Servers はエージェント設定の次のセクション
    const mcpSection = Array.from(mcpSections).find((s) => s.textContent?.includes('MCP Servers'))!;
    const addButton = mcpSection.querySelector('.btn-secondary')!;
    await userEvent.click(addButton);

    expect(screen.queryByText('MCPサーバーが未登録です')).toBeNull();
    expect(screen.getByPlaceholderText('サーバー名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://example.com/mcp')).toBeInTheDocument();
  });

  it('MCP サーバーを追加して削除できる', async () => {
    const { container } = render(<SettingsModal open={true} onClose={vi.fn()} />);

    // MCP Servers セクション内の「+ 追加」ボタンをクリック
    const mcpSections = container.querySelectorAll('.mcp-section');
    const mcpSection = Array.from(mcpSections).find((s) => s.textContent?.includes('MCP Servers'))!;
    const addButton = mcpSection.querySelector('.btn-secondary')!;
    await userEvent.click(addButton);
    expect(screen.getByPlaceholderText('サーバー名')).toBeInTheDocument();

    // 削除
    const deleteButton = mcpSection.querySelector('.btn-danger')!;
    await userEvent.click(deleteButton);
    expect(screen.getByText('MCPサーバーが未登録です')).toBeInTheDocument();
  });

  it('オーバーレイクリックで onClose が呼ばれる', async () => {
    const onClose = vi.fn();
    const { container } = render(<SettingsModal open={true} onClose={onClose} />);

    const overlay = container.querySelector('.modal-overlay');
    if (overlay) {
      await userEvent.click(overlay);
    }
    expect(onClose).toHaveBeenCalled();
  });

  describe('ストレージ情報', () => {
    it('永続化済みの場合、ステータスバッジ「永続化済み」が表示される', async () => {
      mockStorage({ persisted: true, usage: 10 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 });
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(await screen.findByText('永続化済み')).toBeInTheDocument();
      expect(screen.getByText(/ストレージは永続化されています/)).toBeInTheDocument();
      expect(screen.queryByText(/PWA としてインストール/)).not.toBeInTheDocument();
    });

    it('未永続化の場合、ステータスバッジ「未永続化」+ 注意文が表示される', async () => {
      mockStorage({ persisted: false, usage: 10 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 });
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(await screen.findByText('未永続化')).toBeInTheDocument();
      expect(screen.getByText(/ストレージは永続化されていません/)).toBeInTheDocument();
      expect(screen.getByText(/PWA としてインストール/)).toBeInTheDocument();
    });

    it('API 未対応の場合、ストレージセクションが表示されない', () => {
      removeStorage();
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(screen.queryByText('ストレージ')).not.toBeInTheDocument();
      expect(screen.queryByText('永続化済み')).not.toBeInTheDocument();
      expect(screen.queryByText('未永続化')).not.toBeInTheDocument();
    });

    it('容量表示が正しくフォーマットされる', async () => {
      mockStorage({ persisted: true, usage: 52428800, quota: 2147483648 }); // 50MB / 2GB
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(await screen.findByText('50.0 MB / 2.00 GB')).toBeInTheDocument();
    });
  });
});
