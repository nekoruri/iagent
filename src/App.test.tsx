import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';

const mockHeartbeatPanelOpen = vi.fn();

// 依存モジュールのモック
vi.mock('./components/ChatView', () => ({
  ChatView: () => <div data-testid="chat-view" />,
}));
vi.mock('./components/ConversationSidebar', () => ({
  ConversationSidebar: ({ open }: { open: boolean }) => (
    <div data-testid="sidebar" data-open={open ? 'true' : 'false'} />
  ),
}));
vi.mock('./components/FeedPanel', () => ({
  FeedPanel: () => null,
}));
vi.mock('./components/HeartbeatPanel', () => ({
  HeartbeatPanel: () => null,
}));
vi.mock('./components/InstallPrompt', () => ({
  InstallPrompt: () => null,
}));
vi.mock('./components/MemoryPanel', () => ({
  MemoryPanel: () => null,
}));
vi.mock('./components/SettingsModal', () => ({
  SettingsModal: () => null,
}));
vi.mock('./components/SetupWizard', () => ({
  SetupWizard: () => null,
}));
vi.mock('./hooks/useAgentChat', () => ({
  useAgentChat: () => ({
    messages: [],
    isStreaming: false,
    activeTools: [],
    sendMessage: vi.fn(),
    stopStreaming: vi.fn(),
    setMessages: vi.fn(),
  }),
}));
vi.mock('./hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [],
    activeConversationId: null,
    activeConversation: null,
    loaded: true,
    create: vi.fn(),
    switchTo: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
    touch: vi.fn(),
  }),
}));
vi.mock('./hooks/useHeartbeat', () => ({
  useHeartbeat: () => ({ syncHeartbeatConfig: vi.fn() }),
}));
vi.mock('./hooks/useHeartbeatPanel', () => ({
  useHeartbeatPanel: () => ({
    isOpen: false,
    results: [],
    unreadCount: 0,
    toggle: vi.fn(),
    open: mockHeartbeatPanelOpen,
    close: vi.fn(),
    togglePin: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('./hooks/useFeedPanel', () => ({
  useFeedPanel: () => ({
    isOpen: false,
    items: [],
    feeds: [],
    feedMap: new Map(),
    selectedTier: undefined,
    isLoading: false,
    unreadCount: 0,
    explanation: null,
    toggle: vi.fn(),
    close: vi.fn(),
    changeTier: vi.fn(),
    handleMarkRead: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('./hooks/useMemoryPanel', () => ({
  useMemoryPanel: () => ({
    isOpen: false,
    memories: [],
    archivedMemories: [],
    reevaluationCandidates: [],
    selectedCategory: 'all',
    viewTab: 'active',
    isLoading: false,
    toggle: vi.fn(),
    close: vi.fn(),
    changeCategory: vi.fn(),
    changeViewTab: vi.fn(),
    handleDelete: vi.fn(),
    handleUpdate: vi.fn(),
    handleArchive: vi.fn(),
    handleRestore: vi.fn(),
    handleDeleteArchived: vi.fn(),
  }),
}));
vi.mock('./hooks/useViewportHeight', () => ({
  useViewportHeight: vi.fn(),
}));
vi.mock('./core/theme', () => ({
  applyTheme: vi.fn(),
  getStoredThemeMode: vi.fn(() => 'system'),
}));
vi.mock('./core/config', () => ({
  isConfigured: vi.fn(() => true),
  getConfig: vi.fn(() => ({
    openaiApiKey: 'sk-test',
    braveApiKey: '',
    openWeatherMapApiKey: '',
    mcpServers: [],
    heartbeat: { enabled: false },
  })),
  getDefaultWebSpeechConfig: vi.fn(() => ({
    sttEnabled: true,
    ttsEnabled: false,
    ttsAutoRead: false,
    lang: 'ja-JP',
    ttsRate: 1.0,
  })),
}));
vi.mock('./hooks/useSpeechOutput', () => ({
  useSpeechOutput: () => ({
    isSupported: false,
    isSpeaking: false,
    speak: vi.fn(),
    stop: vi.fn(),
    voices: [],
  }),
}));
vi.mock('./core/mcpManager', () => ({
  mcpManager: {
    syncWithConfig: vi.fn(),
    disconnectAll: vi.fn(),
  },
}));
vi.mock('./store/conversationStore', () => ({
  saveMessage: vi.fn(),
}));

function setMobileViewport(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(max-width: 768px)' ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('App', () => {
  let persistMock: ReturnType<typeof vi.fn>;
  let serviceWorkerMessageHandler: ((event: MessageEvent) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    setMobileViewport(false);
    serviceWorkerMessageHandler = null;
    persistMock = vi.fn(async () => true);
    Object.defineProperty(navigator, 'storage', {
      value: {
        persist: persistMock,
        persisted: vi.fn(async () => false),
        estimate: vi.fn(async () => ({ usage: 0, quota: 0 })),
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
          if (type === 'message') {
            serviceWorkerMessageHandler = handler;
          }
        }),
        removeEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未永続化の場合、起動時に navigator.storage.persist() が呼ばれる', async () => {
    vi.resetModules();
    const { default: App } = await import('./App');
    render(<App />);
    await waitFor(() => {
      expect(persistMock).toHaveBeenCalled();
    });
  });

  it('既に永続化済みの場合、persist() は呼ばれない', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        persist: persistMock,
        persisted: vi.fn(async () => true),
        estimate: vi.fn(async () => ({ usage: 0, quota: 0 })),
      },
      writable: true,
      configurable: true,
    });
    vi.resetModules();
    const { default: App } = await import('./App');
    render(<App />);
    // persisted() が true を返すので persist() は呼ばれない
    await waitFor(() => {
      expect(persistMock).not.toHaveBeenCalled();
    });
  });

  it('モバイル幅で左端から右スワイプするとサイドバーが開く', async () => {
    setMobileViewport(true);
    vi.resetModules();
    const { default: App } = await import('./App');
    const { container } = render(<App />);
    const appContainer = container.querySelector('.app-container');
    expect(appContainer).toBeTruthy();
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');

    fireEvent.touchStart(appContainer!, {
      touches: [{ clientX: 8, clientY: 120 }],
      changedTouches: [{ clientX: 8, clientY: 120 }],
    });
    fireEvent.touchMove(appContainer!, {
      touches: [{ clientX: 120, clientY: 128 }],
      changedTouches: [{ clientX: 120, clientY: 128 }],
    });
    fireEvent.touchEnd(appContainer!, {
      touches: [],
      changedTouches: [{ clientX: 120, clientY: 128 }],
    });

    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'true');
    expect(container.querySelector('.sidebar-overlay')).toBeInTheDocument();
  });

  it('モバイル幅で開いているサイドバーを左スワイプで閉じられる', async () => {
    setMobileViewport(true);
    vi.resetModules();
    const { default: App } = await import('./App');
    const { container } = render(<App />);
    const appContainer = container.querySelector('.app-container');
    expect(appContainer).toBeTruthy();

    fireEvent.click(screen.getByTitle('会話一覧'));
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'true');

    fireEvent.touchStart(appContainer!, {
      touches: [{ clientX: 220, clientY: 150 }],
      changedTouches: [{ clientX: 220, clientY: 150 }],
    });
    fireEvent.touchMove(appContainer!, {
      touches: [{ clientX: 100, clientY: 158 }],
      changedTouches: [{ clientX: 100, clientY: 158 }],
    });
    fireEvent.touchEnd(appContainer!, {
      touches: [],
      changedTouches: [{ clientX: 100, clientY: 158 }],
    });

    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
  });

  it('デスクトップ幅では左端スワイプしてもサイドバーは開かない', async () => {
    setMobileViewport(false);
    vi.resetModules();
    const { default: App } = await import('./App');
    const { container } = render(<App />);
    const appContainer = container.querySelector('.app-container');
    expect(appContainer).toBeTruthy();

    fireEvent.touchStart(appContainer!, {
      touches: [{ clientX: 8, clientY: 120 }],
      changedTouches: [{ clientX: 8, clientY: 120 }],
    });
    fireEvent.touchMove(appContainer!, {
      touches: [{ clientX: 120, clientY: 128 }],
      changedTouches: [{ clientX: 120, clientY: 128 }],
    });
    fireEvent.touchEnd(appContainer!, {
      touches: [],
      changedTouches: [{ clientX: 120, clientY: 128 }],
    });

    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
  });

  it('Service Worker から heartbeat-open を受けると Heartbeat パネルを開く', async () => {
    vi.resetModules();
    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(typeof serviceWorkerMessageHandler).toBe('function');
    });

    serviceWorkerMessageHandler?.(new MessageEvent('message', { data: { type: 'heartbeat-open' } }));

    expect(mockHeartbeatPanelOpen).toHaveBeenCalled();
  });
});
