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
  getDefaultWebSpeechConfig: vi.fn(() => ({
    sttEnabled: true,
    ttsEnabled: false,
    ttsAutoRead: false,
    lang: 'ja-JP',
    ttsRate: 1.0,
  })),
  BUILTIN_HEARTBEAT_TASKS: [],
}));

// speechService モック
vi.mock('../core/speechService', () => ({
  isSpeechRecognitionSupported: vi.fn(() => false),
  isSpeechSynthesisSupported: vi.fn(() => false),
}));

// installDetect モック
const mockIsIOSSafari = vi.fn(() => false);
const mockIsStandaloneMode = vi.fn(() => false);
vi.mock('../core/installDetect', () => ({
  isIOSSafari: () => mockIsIOSSafari(),
  isStandaloneMode: () => mockIsStandaloneMode(),
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
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    expect(screen.getByText('MCPサーバーが未登録です')).toBeInTheDocument();

    // MCP Servers セクション内の「+ 追加」ボタンをクリック
    const mcpSection = screen.getByText('MCP Servers').closest('.settings-section')!;
    const addButton = mcpSection.querySelector('.btn-secondary')!;
    await userEvent.click(addButton);

    expect(screen.queryByText('MCPサーバーが未登録です')).toBeNull();
    expect(screen.getByPlaceholderText('サーバー名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://example.com/mcp')).toBeInTheDocument();
  });

  it('MCP サーバーを追加して削除できる', async () => {
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    // MCP Servers セクション内の「+ 追加」ボタンをクリック
    const mcpSection = screen.getByText('MCP Servers').closest('.settings-section')!;
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

  describe('アコーディオン構造', () => {
    it('全セクションが details 要素でラップされている', async () => {
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      // ストレージセクションは非同期で表示されるため待つ
      await screen.findByText('ストレージ', { selector: 'summary > span' });

      const expectedSections = [
        '基本設定',
        'エージェント設定',
        'MCP Servers',
        'Heartbeat',
        'CORS プロキシ',
        'オブザーバビリティ',
        'ストレージ',
      ];

      for (const name of expectedSections) {
        const summary = screen.getByText(name, { selector: 'summary, summary > span' });
        expect(summary.closest('details.settings-section')).not.toBeNull();
      }
    });

    it('全セクションが初期展開されている', async () => {
      const { container } = render(<SettingsModal open={true} onClose={vi.fn()} />);
      // ストレージセクションは非同期で表示されるため待つ
      await screen.findByText('ストレージ', { selector: 'summary > span' });

      const sections = container.querySelectorAll('details.settings-section');
      expect(sections.length).toBeGreaterThanOrEqual(6);
      sections.forEach((section) => {
        expect(section).toHaveAttribute('open');
      });
    });

    it('summary クリックでセクションの開閉ができる', async () => {
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      const summary = screen.getByText('基本設定');
      const details = summary.closest('details')!;
      expect(details).toHaveAttribute('open');

      // クリックで閉じる
      await userEvent.click(summary);
      expect(details).not.toHaveAttribute('open');

      // 再クリックで開く
      await userEvent.click(summary);
      expect(details).toHaveAttribute('open');
    });

    it('summary 内のボタンクリックではセクションが開閉しない', async () => {
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      // MCP Servers セクションの「+ 追加」ボタン
      const mcpSection = screen.getByText('MCP Servers').closest('details')!;
      expect(mcpSection).toHaveAttribute('open');
      const addButton = mcpSection.querySelector('summary .btn-secondary')!;
      await userEvent.click(addButton);
      // セクションは開いたまま
      expect(mcpSection).toHaveAttribute('open');
    });

    it('summary 内のトグルクリックではセクションが開閉しない', async () => {
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      // Heartbeat セクションの「有効」トグル
      const heartbeatSection = screen.getByText('Heartbeat').closest('details')!;
      expect(heartbeatSection).toHaveAttribute('open');
      const toggle = heartbeatSection.querySelector('summary input[type="checkbox"]')!;
      await userEvent.click(toggle);
      // セクションは開いたまま
      expect(heartbeatSection).toHaveAttribute('open');
    });

    it('閉じたセクションが state 更新後も閉じたままである', async () => {
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      // 基本設定を閉じる
      const summary = screen.getByText('基本設定');
      const details = summary.closest('details')!;
      await userEvent.click(summary);
      expect(details).not.toHaveAttribute('open');

      // 別の入力で state を更新
      const openaiInput = screen.getByPlaceholderText('sk-...');
      await userEvent.type(openaiInput, 'x');

      // 基本設定は閉じたまま
      expect(details).not.toHaveAttribute('open');
    });
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

    it('iOS 未インストール時にストレージセクションにインストールガイドが表示される', async () => {
      mockIsIOSSafari.mockReturnValue(true);
      mockIsStandaloneMode.mockReturnValue(false);
      mockStorage({ persisted: false, usage: 10 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 });
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(await screen.findByText('未永続化')).toBeInTheDocument();
      expect(screen.getByText(/共有ボタン/)).toBeInTheDocument();
      expect(screen.getByText('ホーム画面に追加')).toBeInTheDocument();
    });

    it('iOS スタンドアロン時にインストールガイドが表示されない', async () => {
      mockIsIOSSafari.mockReturnValue(true);
      mockIsStandaloneMode.mockReturnValue(true);
      mockStorage({ persisted: false, usage: 10 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 });
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(await screen.findByText('未永続化')).toBeInTheDocument();
      expect(screen.queryByText('ホーム画面に追加')).not.toBeInTheDocument();
    });

    it('非 iOS 環境ではインストールガイドが表示されない', async () => {
      mockIsIOSSafari.mockReturnValue(false);
      mockIsStandaloneMode.mockReturnValue(false);
      mockStorage({ persisted: false, usage: 10 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 });
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(await screen.findByText('未永続化')).toBeInTheDocument();
      expect(screen.queryByText('ホーム画面に追加')).not.toBeInTheDocument();
    });
  });

  describe('Push セクション iOS 案内', () => {
    it('iOS 未インストール時に Push セクションに案内が表示される', () => {
      mockIsIOSSafari.mockReturnValue(true);
      mockIsStandaloneMode.mockReturnValue(false);
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(screen.getByText(/iOS で Push 通知を受け取るには/)).toBeInTheDocument();
    });

    it('iOS スタンドアロン時に Push セクションの案内が表示されない', () => {
      mockIsIOSSafari.mockReturnValue(true);
      mockIsStandaloneMode.mockReturnValue(true);
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(screen.queryByText(/iOS で Push 通知を受け取るには/)).not.toBeInTheDocument();
    });
  });

  describe('通知権限回復導線', () => {
    it('default の場合は未設定ガイドが表示され、Push 有効化は無効化される', () => {
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(screen.getByText('通知権限: 未設定')).toBeInTheDocument();
      expect(screen.getByText(/通知権限は未設定です/)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Push 通知を有効化' })).toBeDisabled();
    });

    it('denied の場合はブロック状態を表示し、デスクトップ通知トグルを無効化する', async () => {
      const { getNotificationPermission } = await import('../core/notifier');
      vi.mocked(getNotificationPermission).mockReturnValue('denied');

      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(screen.getByText('通知権限: ブロック中')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'デスクトップ通知' })).toBeDisabled();
    });

    it('権限を再確認ボタンで状態表示を更新できる', async () => {
      const { getNotificationPermission } = await import('../core/notifier');
      vi.mocked(getNotificationPermission)
        .mockReturnValueOnce('default')
        .mockReturnValueOnce('default')
        .mockReturnValue('granted');

      render(<SettingsModal open={true} onClose={vi.fn()} />);
      expect(screen.getByText('通知権限: 未設定')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: '権限を再確認' }));

      expect(screen.getByText('通知権限: 許可済み')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Push 通知を有効化' })).toBeEnabled();
    });

    it('通知許可が denied の場合、デスクトップ通知は ON にならない', async () => {
      const { requestNotificationPermission } = await import('../core/notifier');
      vi.mocked(requestNotificationPermission).mockResolvedValue('denied');

      render(<SettingsModal open={true} onClose={vi.fn()} />);

      const desktopToggle = screen.getByRole('checkbox', { name: 'デスクトップ通知' });
      await userEvent.click(desktopToggle);

      expect(requestNotificationPermission).toHaveBeenCalled();
      expect(desktopToggle).not.toBeChecked();
      expect(screen.getByText('通知権限: ブロック中')).toBeInTheDocument();
    });
  });
});
