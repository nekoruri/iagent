import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { ChatView } from './components/ChatView';
import { ConversationSidebar } from './components/ConversationSidebar';
import { HeartbeatPanel } from './components/HeartbeatPanel';
import { InstallPrompt } from './components/InstallPrompt';
import { MemoryPanel } from './components/MemoryPanel';
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const SetupWizard = lazy(() =>
  import('./components/SetupWizard').then((m) => ({ default: m.SetupWizard }))
);
import { useAgentChat } from './hooks/useAgentChat';
import { useConversations } from './hooks/useConversations';
import { useHeartbeat } from './hooks/useHeartbeat';
import { useHeartbeatPanel } from './hooks/useHeartbeatPanel';
import { useMemoryPanel } from './hooks/useMemoryPanel';
import { useViewportHeight } from './hooks/useViewportHeight';
import { applyTheme, getStoredThemeMode } from './core/theme';
import { isConfigured, getConfig } from './core/config';
import { mcpManager } from './core/mcpManager';
import { saveMessage } from './store/conversationStore';
import type { HeartbeatNotification } from './core/heartbeat';
import type { ChatMessage } from './types';

const HEARTBEAT_HINT_KEY = 'iagent-heartbeat-hint-shown';

export default function App() {
  useViewportHeight();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    conversations,
    activeConversationId,
    activeConversation,
    loaded,
    create,
    switchTo,
    remove,
    rename,
    touch,
  } = useConversations();

  const { messages, isStreaming, activeTools, sendMessage, stopStreaming, setMessages } =
    useAgentChat(activeConversationId);

  const heartbeatPanel = useHeartbeatPanel();
  const memoryPanel = useMemoryPanel();

  // system モード時の OS テーマ変更リスニング
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getStoredThemeMode() === 'system') {
        applyTheme('system');
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const handleHeartbeatNotification = useCallback((notification: HeartbeatNotification) => {
    if (!activeConversationId) return;
    for (const result of notification.results) {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `[Heartbeat] ${result.summary}`,
        timestamp: Date.now(),
        source: 'heartbeat',
        conversationId: activeConversationId,
      };
      setMessages((prev) => [...prev, msg]);
      saveMessage(msg);
    }
    heartbeatPanel.refresh();
  }, [setMessages, activeConversationId, heartbeatPanel]);

  const [heartbeatEnabled, setHeartbeatEnabled] = useState(
    () => getConfig().heartbeat?.enabled ?? false,
  );

  const { syncHeartbeatConfig } = useHeartbeat({
    isStreaming,
    onNotification: handleHeartbeatNotification,
  });

  useEffect(() => {
    if (loaded && !isConfigured()) {
      setShowWizard(true);
    }
  }, [loaded]);

  // 起動時にMCPサーバーに接続
  useEffect(() => {
    const config = getConfig();
    if (config.mcpServers.length > 0) {
      mcpManager.syncWithConfig(config.mcpServers);
    }
    return () => {
      mcpManager.disconnectAll();
    };
  }, []);

  // ストレージ永続化リクエスト
  // iOS Safari 7日削除対策が主目的だが、全ブラウザで有効（Chrome は自動許可、Firefox はプロンプト表示）。
  // persisted() で確認し、未永続化の場合のみ persist() を呼ぶ。
  useEffect(() => {
    (async () => {
      try {
        const persisted = await navigator.storage?.persisted?.();
        if (persisted === false) {
          await navigator.storage?.persist?.();
        }
      } catch {
        // 非対応環境では無視
      }
    })();
  }, []);

  // メッセージ送信時にタイトル自動設定 & touch
  const handleSend = useCallback(async (text: string) => {
    if (!activeConversationId) return;

    // 最初のメッセージならタイトルを自動設定
    if (messages.length === 0) {
      await rename(activeConversationId, text.slice(0, 30));
    }

    await sendMessage(text);
    // メッセージ数 +2（ユーザー + アシスタント）で touch
    await touch(activeConversationId, messages.length + 2);
  }, [activeConversationId, messages.length, sendMessage, rename, touch]);

  const handleSidebarSelect = useCallback((id: string) => {
    if (isStreaming) return;
    switchTo(id);
    setSidebarOpen(false);
  }, [isStreaming, switchTo]);

  const handleSidebarCreate = useCallback(async () => {
    if (isStreaming) return;
    await create();
    setSidebarOpen(false);
  }, [isStreaming, create]);

  const handleSidebarDelete = useCallback(async (id: string) => {
    if (isStreaming) return;
    await remove(id);
  }, [isStreaming, remove]);

  const handleWizardComplete = async () => {
    setShowWizard(false);
    syncHeartbeatConfig();
    setHeartbeatEnabled(getConfig().heartbeat?.enabled ?? false);
    localStorage.setItem(HEARTBEAT_HINT_KEY, '1');
    // 初回セットアップ後に最初の会話を作成
    if (!activeConversationId) {
      await create();
    }
  };

  const handleSettingsClose = () => {
    setSettingsOpen(false);
    syncHeartbeatConfig();
    setHeartbeatEnabled(getConfig().heartbeat?.enabled ?? false);

    // 初回設定完了時に heartbeat の案内を表示
    const config = getConfig();
    if (
      config.openaiApiKey &&
      !config.heartbeat?.enabled &&
      !localStorage.getItem(HEARTBEAT_HINT_KEY)
    ) {
      localStorage.setItem(HEARTBEAT_HINT_KEY, '1');
      const hintMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Heartbeat 機能を使うと、カレンダーの予定や天気の変化を定期的にチェックして自動で通知できます。設定画面の「Heartbeat」セクションから有効にできます。',
        timestamp: Date.now(),
        source: 'heartbeat',
        conversationId: activeConversationId ?? undefined,
      };
      setMessages((prev) => [...prev, hintMsg]);
      if (activeConversationId) {
        saveMessage(hintMsg);
      }
    }
  };

  return (
    <div className="app-container">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        open={sidebarOpen}
        onSelect={handleSidebarSelect}
        onCreate={handleSidebarCreate}
        onDelete={handleSidebarDelete}
        onClose={() => setSidebarOpen(false)}
      />
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <div className="app">
        <header className="app-header">
          <div className="header-title">
            <button
              className="btn-icon sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              title="会話一覧"
            >
              &#9776;
            </button>
            <h1>{activeConversation?.title ?? 'iAgent'}</h1>
            {heartbeatEnabled && (
              <span className="heartbeat-indicator" title="Heartbeat 稼働中" />
            )}
          </div>
          <div className="header-actions">
            <button className="btn-icon" onClick={handleSidebarCreate} title="新しい会話">
              +
            </button>
            <MemoryPanel
              isOpen={memoryPanel.isOpen}
              memories={memoryPanel.memories}
              selectedCategory={memoryPanel.selectedCategory}
              isLoading={memoryPanel.isLoading}
              onToggle={memoryPanel.toggle}
              onClose={memoryPanel.close}
              onChangeCategory={memoryPanel.changeCategory}
              onDelete={memoryPanel.handleDelete}
            />
            {heartbeatEnabled && (
              <HeartbeatPanel
                isOpen={heartbeatPanel.isOpen}
                results={heartbeatPanel.results}
                unreadCount={heartbeatPanel.unreadCount}
                onToggle={heartbeatPanel.toggle}
                onClose={heartbeatPanel.close}
                onTogglePin={heartbeatPanel.togglePin}
                onFeedback={heartbeatPanel.sendFeedback}
              />
            )}
            <button className="btn-icon" onClick={() => setSettingsOpen(true)} title="設定">
              &#9881;
            </button>
          </div>
        </header>
        <InstallPrompt />
        <main className="app-main">
          <ChatView
            messages={messages}
            isStreaming={isStreaming}
            activeTools={activeTools}
            onSend={handleSend}
            onStop={stopStreaming}
          />
        </main>
        <Suspense fallback={null}>
          {showWizard && <SetupWizard onComplete={handleWizardComplete} />}
          <SettingsModal open={settingsOpen} onClose={handleSettingsClose} />
        </Suspense>
      </div>
    </div>
  );
}
