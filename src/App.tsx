import { useState, useEffect } from 'react';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { useAgentChat } from './hooks/useAgentChat';
import { isConfigured, getConfig } from './core/config';
import { mcpManager } from './core/mcpManager';
import { loadMessages, clearMessages } from './store/conversationStore';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { messages, isStreaming, activeTools, sendMessage, stopStreaming, clearChat, setMessages } = useAgentChat();

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>iAgent</h1>
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
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
