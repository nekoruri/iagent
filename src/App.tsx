import { useState, useEffect, useCallback } from 'react';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { useAgentChat } from './hooks/useAgentChat';
import { useHeartbeat } from './hooks/useHeartbeat';
import { isConfigured, getConfig } from './core/config';
import { mcpManager } from './core/mcpManager';
import { loadMessages, clearMessages } from './store/conversationStore';
import { saveMessage } from './store/conversationStore';
import type { HeartbeatNotification } from './core/heartbeat';
import type { ChatMessage } from './types';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { messages, isStreaming, activeTools, sendMessage, stopStreaming, clearChat, setMessages } = useAgentChat();

  const handleHeartbeatNotification = useCallback((notification: HeartbeatNotification) => {
    for (const result of notification.results) {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `[Heartbeat] ${result.summary}`,
        timestamp: Date.now(),
        source: 'heartbeat',
      };
      setMessages((prev) => [...prev, msg]);
      saveMessage(msg);
    }
  }, [setMessages]);

  const { syncHeartbeatConfig } = useHeartbeat({
    isStreaming,
    onNotification: handleHeartbeatNotification,
  });

  const heartbeatEnabled = getConfig().heartbeat?.enabled ?? false;

  useEffect(() => {
    loadMessages().then((saved) => {
      if (saved.length > 0) {
        setMessages(saved);
      }
      setLoaded(true);
    });
  }, [setMessages]);

  useEffect(() => {
    if (loaded && !isConfigured()) {
      setSettingsOpen(true);
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

  const handleClearChat = async () => {
    clearChat();
    await clearMessages();
  };

  const handleSettingsClose = () => {
    setSettingsOpen(false);
    syncHeartbeatConfig();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <h1>iAgent</h1>
          {heartbeatEnabled && (
            <span className="heartbeat-indicator" title="Heartbeat 稼働中" />
          )}
        </div>
        <div className="header-actions">
          <button className="btn-icon" onClick={handleClearChat} title="チャットをクリア">
            🗑
          </button>
          <button className="btn-icon" onClick={() => setSettingsOpen(true)} title="設定">
            ⚙
          </button>
        </div>
      </header>
      <main className="app-main">
        <ChatView
          messages={messages}
          isStreaming={isStreaming}
          activeTools={activeTools}
          onSend={sendMessage}
          onStop={stopStreaming}
        />
      </main>
      <SettingsModal open={settingsOpen} onClose={handleSettingsClose} />
    </div>
  );
}
