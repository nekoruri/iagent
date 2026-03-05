import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from './SettingsModal';

function createMockConfig() {
  return {
    openaiApiKey: '',
    braveApiKey: '',
    openWeatherMapApiKey: '',
    mcpServers: [],
    heartbeat: {
      enabled: false,
      intervalMinutes: 30,
      quietHoursStart: 0,
      quietHoursEnd: 6,
      quietDays: [],
      maxNotificationsPerDay: 0,
      tasks: [],
      desktopNotification: false,
      focusMode: false,
      costControl: {
        enabled: true,
        dailyTokenBudget: 0,
        pressureThreshold: 0.8,
        deferNonCriticalTasks: true,
      },
    },
    otel: {
      enabled: false,
      endpoint: '/api/otel',
      headers: {},
      batchSize: 10,
      flushIntervalMs: 30000,
    },
  };
}

// config モック
vi.mock('../core/config', () => ({
  getConfig: vi.fn(() => createMockConfig()),
  saveConfig: vi.fn(),
  getDefaultHeartbeatConfig: vi.fn(() => ({
    enabled: false,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    quietDays: [],
    maxNotificationsPerDay: 0,
    tasks: [],
    desktopNotification: false,
    focusMode: false,
    costControl: {
      enabled: true,
      dailyTokenBudget: 0,
      pressureThreshold: 0.8,
      deferNonCriticalTasks: true,
    },
  })),
  getDefaultHeartbeatCostControlConfig: vi.fn(() => ({
    enabled: true,
    dailyTokenBudget: 0,
    pressureThreshold: 0.8,
    deferNonCriticalTasks: true,
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

// data portability モック
vi.mock('../core/dataPortability', () => ({
  exportDataPortability: vi.fn(async () => ({
    payload: {},
    json: '{"format":"iagent-data-export"}',
    filename: 'iagent-backup-20260305-120000.json',
    bytes: 128,
    counts: {
      conversationMeta: 1,
      conversations: 2,
      memories: 3,
      archivedMemories: 0,
      attachments: 1,
    },
  })),
  importDataPortabilityFromJson: vi.fn(async () => ({
    importedAt: Date.now(),
    counts: {
      conversationMeta: 1,
      conversations: 2,
      memories: 3,
      archivedMemories: 0,
      attachments: 1,
    },
  })),
  getDataPortabilityErrorMessage: vi.fn((error: unknown) => (
    error instanceof Error ? error.message : String(error)
  )),
}));

// heartbeatStore モック
vi.mock('../store/heartbeatStore', () => ({
  loadActionLog: vi.fn(async () => []),
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
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getConfig } = await import('../core/config');
    vi.mocked(getConfig).mockImplementation(() => createMockConfig());
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

  it('保存済み API キーは再入力しなくても保持される', async () => {
    const { getConfig, saveConfig } = await import('../core/config');
    vi.mocked(getConfig).mockReturnValue({
      ...createMockConfig(),
      openaiApiKey: 'sk-existing',
      braveApiKey: 'BSA-existing',
      openWeatherMapApiKey: 'owm-existing',
    });
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    expect(screen.getAllByText('保存済み。変更しない場合は再入力不要です。').length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText('保存済み（変更する場合のみ入力）').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByText('保存'));

    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      openaiApiKey: 'sk-existing',
      braveApiKey: 'BSA-existing',
      openWeatherMapApiKey: 'owm-existing',
    }));
  });

  it('API キーを更新すると trim して保存される', async () => {
    const { saveConfig } = await import('../core/config');
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    const openaiInput = screen.getByPlaceholderText('sk-...');
    await userEvent.type(openaiInput, '  sk-new-key  ');
    await userEvent.click(screen.getByText('保存'));

    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      openaiApiKey: 'sk-new-key',
    }));
  });

  it('保存済み API キーを削除して保存できる', async () => {
    const { getConfig, saveConfig } = await import('../core/config');
    vi.mocked(getConfig).mockReturnValue({
      ...createMockConfig(),
      openaiApiKey: 'sk-existing',
    });
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '保存済みキーを削除' }));
    expect(screen.getByText('保存時に削除されます。')).toBeInTheDocument();

    await userEvent.click(screen.getByText('保存'));
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      openaiApiKey: '',
    }));
  });

  it('最小権限プリセットで権限系設定を一括で無効化できる', async () => {
    const { getConfig, saveConfig } = await import('../core/config');
    vi.mocked(getConfig).mockReturnValue({
      ...createMockConfig(),
      mcpServers: [
        {
          id: 'mcp-1',
          name: 'github',
          url: 'https://example.com/mcp',
          enabled: true,
        },
      ],
      heartbeat: {
        ...createMockConfig().heartbeat,
        enabled: true,
        desktopNotification: true,
      },
      proxy: {
        enabled: true,
        serverUrl: 'https://proxy.example',
        authToken: 'token',
        allowedDomains: ['example.com'],
      },
      webSpeech: {
        sttEnabled: true,
        ttsEnabled: true,
        ttsAutoRead: true,
        lang: 'ja-JP',
        ttsRate: 1.0,
      },
    });
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '最小権限プリセットを適用' }));
    expect(screen.getByText(/最小権限プリセットを適用しました/)).toBeInTheDocument();

    await userEvent.click(screen.getByText('保存'));
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      mcpServers: [
        expect.objectContaining({ enabled: false }),
      ],
      heartbeat: expect.objectContaining({
        enabled: false,
        desktopNotification: false,
      }),
      proxy: expect.objectContaining({
        enabled: false,
      }),
      webSpeech: expect.objectContaining({
        sttEnabled: false,
        ttsEnabled: false,
        ttsAutoRead: false,
      }),
    }));
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

  it('MCP 推奨プリセット追加で GitHub/Notion/RSS Reader が追加される', async () => {
    render(<SettingsModal open={true} onClose={vi.fn()} />);
    const mcpSection = screen.getByText('MCP Servers').closest('.settings-section') as HTMLElement;

    await userEvent.click(screen.getByRole('button', { name: '推奨セットを追加' }));

    expect(within(mcpSection).getByDisplayValue('github')).toBeInTheDocument();
    expect(within(mcpSection).getByDisplayValue('notion')).toBeInTheDocument();
    expect(within(mcpSection).getByDisplayValue('rss-reader')).toBeInTheDocument();
    expect(within(mcpSection).getByText(/を追加しました/)).toBeInTheDocument();
  });

  it('MCP 推奨プリセットを再追加すると重複スキップの警告が表示される', async () => {
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    const recommendedButton = screen.getByRole('button', { name: '推奨セットを追加' });
    await userEvent.click(recommendedButton);
    await userEvent.click(recommendedButton);

    expect(screen.getByText('選択したプリセットはすべて追加済みです。')).toBeInTheDocument();
  });

  it('自動実行ログが空の場合に空状態メッセージを表示する', async () => {
    const { loadActionLog } = await import('../store/heartbeatStore');
    vi.mocked(loadActionLog).mockResolvedValue([]);
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    await waitFor(() => expect(loadActionLog).toHaveBeenCalledTimes(1));
    expect(screen.getByText('自動実行ログ（Action Planning）')).toBeInTheDocument();
    expect(screen.getByText('ログはまだありません。')).toBeInTheDocument();
  });

  it('自動実行ログを新しい順で表示する', async () => {
    const { loadActionLog } = await import('../store/heartbeatStore');
    vi.mocked(loadActionLog).mockResolvedValue([
      { type: 'toggle-task', reason: '古いログ', detail: 'old', timestamp: 1000 },
      { type: 'update-task-interval', reason: '中間ログ', detail: 'mid', timestamp: 2000 },
      { type: 'update-quiet-hours', reason: '最新ログ', detail: 'new', timestamp: 3000 },
    ]);
    const { container } = render(<SettingsModal open={true} onClose={vi.fn()} />);

    await screen.findByText('最新ログ');
    const items = container.querySelectorAll('.hb-action-log-item');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('最新ログ');
    expect(items[1]).toHaveTextContent('中間ログ');
    expect(items[2]).toHaveTextContent('古いログ');
    expect(screen.getByText('静寂時間')).toBeInTheDocument();
    expect(screen.getByText('間隔変更')).toBeInTheDocument();
    expect(screen.getByText('タスク切替')).toBeInTheDocument();
  });

  it('自動実行ログの再読み込みボタンで最新ログを取得できる', async () => {
    const { loadActionLog } = await import('../store/heartbeatStore');
    vi.mocked(loadActionLog)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { type: 'update-quiet-days', reason: '再取得ログ', detail: '火木を追加', timestamp: 4000 },
      ]);
    render(<SettingsModal open={true} onClose={vi.fn()} />);

    await waitFor(() => expect(loadActionLog).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    await waitFor(() => expect(loadActionLog).toHaveBeenCalledTimes(2));
    expect(screen.getByText('再取得ログ')).toBeInTheDocument();
    expect(screen.getByText('静寂曜日')).toBeInTheDocument();
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
    it('ストレージセクションにデータエクスポート/インポート操作が表示される', async () => {
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(await screen.findByText('永続化済み')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'データをエクスポート' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'データをインポート' })).toBeInTheDocument();
    });

    it('データをエクスポートすると完了メッセージを表示する', async () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const createObjectUrl = vi.fn(() => 'blob:mock-backup');
      const revokeObjectUrl = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', {
        value: createObjectUrl,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: revokeObjectUrl,
        writable: true,
        configurable: true,
      });

      const { exportDataPortability } = await import('../core/dataPortability');
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(await screen.findByText('永続化済み')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'データをエクスポート' }));

      expect(exportDataPortability).toHaveBeenCalled();
      expect(screen.getByText(/エクスポート完了:/)).toBeInTheDocument();
      clickSpy.mockRestore();
    });

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

  describe('コスト制御設定', () => {
    it('コスト制御の初期設定が表示される', () => {
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      expect(screen.getByRole('checkbox', { name: 'コスト制御を有効化' })).toBeChecked();
      expect(screen.getByText('日次トークン予算: 無制限')).toBeInTheDocument();
      expect(screen.getByText('予算逼迫しきい値: 80%')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: '予算逼迫時に非クリティカルタスクを次回回し' })).toBeChecked();
    });

    it('日次トークン予算スライダーを変更すると表示が更新される', async () => {
      render(<SettingsModal open={true} onClose={vi.fn()} />);

      const slider = screen.getByRole('slider', { name: /日次トークン予算/ });
      fireEvent.change(slider, { target: { value: '1000' } });

      expect(screen.getByText(/日次トークン予算: \d{1,3}(,\d{3})* tokens/)).toBeInTheDocument();
    });
  });
});
