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
  BUILTIN_HEARTBEAT_TASKS: [],
}));

// corsProxy モック
vi.mock('../core/corsProxy', () => ({
  registerProxyToken: vi.fn(async () => 'mock-token'),
}));

// mcpManager モック
vi.mock('../core/mcpManager', () => ({
  mcpManager: {
    subscribe: vi.fn(() => vi.fn()),
    syncWithConfig: vi.fn(async () => {}),
    getStatus: vi.fn(() => 'disconnected'),
    getError: vi.fn(() => null),
  },
}));

// notifier モック
vi.mock('../core/notifier', () => ({
  getNotificationPermission: vi.fn(() => 'default'),
  requestNotificationPermission: vi.fn(async () => 'granted'),
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    // MCP Servers セクション内の「+ 追加」ボタンをクリック
    const mcpSection = container.querySelector('.mcp-section')!;
    const addButton = mcpSection.querySelector('.btn-secondary')!;
    await userEvent.click(addButton);

    expect(screen.queryByText('MCPサーバーが未登録です')).toBeNull();
    expect(screen.getByPlaceholderText('サーバー名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://example.com/mcp')).toBeInTheDocument();
  });

  it('MCP サーバーを追加して削除できる', async () => {
    const { container } = render(<SettingsModal open={true} onClose={vi.fn()} />);

    // MCP Servers セクション内の「+ 追加」ボタンをクリック
    const mcpSection = container.querySelector('.mcp-section')!;
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
});
