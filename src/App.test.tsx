import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

// 依存モジュールのモック
vi.mock('./components/ChatView', () => ({
  ChatView: () => <div data-testid="chat-view" />,
}));
vi.mock('./components/ConversationSidebar', () => ({
  ConversationSidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('./components/HeartbeatPanel', () => ({
  HeartbeatPanel: () => null,
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
    close: vi.fn(),
    togglePin: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('./hooks/useMemoryPanel', () => ({
  useMemoryPanel: () => ({
    isOpen: false,
    memories: [],
    selectedCategory: 'all',
    isLoading: false,
    toggle: vi.fn(),
    close: vi.fn(),
    changeCategory: vi.fn(),
    handleDelete: vi.fn(),
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

describe('App', () => {
  let persistMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('起動時に navigator.storage.persist() が呼ばれる', async () => {
    const { default: App } = await import('./App');
    render(<App />);
    expect(persistMock).toHaveBeenCalled();
  });
});
