import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { ChatView } from './components/ChatView';
import { ConversationSidebar } from './components/ConversationSidebar';
import { FeedPanel } from './components/FeedPanel';
import { HeartbeatPanel } from './components/HeartbeatPanel';
import { InstallPrompt } from './components/InstallPrompt';
import { MemoryPanel } from './components/MemoryPanel';
import { OfflineBanner } from './components/OfflineBanner';
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const SetupWizard = lazy(() =>
  import('./components/SetupWizard').then((m) => ({ default: m.SetupWizard }))
);
import { useAgentChat } from './hooks/useAgentChat';
import { useConversations } from './hooks/useConversations';
import { useFeedPanel } from './hooks/useFeedPanel';
import { useHeartbeat } from './hooks/useHeartbeat';
import { useHeartbeatPanel } from './hooks/useHeartbeatPanel';
import { useMemoryPanel } from './hooks/useMemoryPanel';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSpeechOutput } from './hooks/useSpeechOutput';
import { useViewportHeight } from './hooks/useViewportHeight';
import { applyTheme, getStoredThemeMode } from './core/theme';
import { isConfigured, getConfig, getDefaultWebSpeechConfig } from './core/config';
import { mcpManager } from './core/mcpManager';
import { saveMessage } from './store/conversationStore';
import type { HeartbeatNotification } from './core/heartbeat';
import type { ChatMessage } from './types';
import type { PendingAttachment } from './types/attachment';

const HEARTBEAT_HINT_KEY = 'iagent-heartbeat-hint-shown';

export default function App() {
  useViewportHeight();
  const isOnline = useOnlineStatus();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(false);
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

  const feedPanel = useFeedPanel();
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
    if (notification.results.some((r) => r.taskId === 'feed-check')) {
      feedPanel.refresh(feedPanel.selectedTier);
    }
  }, [setMessages, activeConversationId, heartbeatPanel, feedPanel]);

  const [heartbeatEnabled, setHeartbeatEnabled] = useState(
    () => getConfig().heartbeat?.enabled ?? false,
  );
  const [focusMode, setFocusMode] = useState(
    () => getConfig().heartbeat?.focusMode ?? false,
  );

  // 音声入出力
  const webSpeech = getConfig().webSpeech ?? getDefaultWebSpeechConfig();
  const speechOutput = useSpeechOutput(webSpeech.lang, webSpeech.ttsRate, webSpeech.ttsEnabled);

  const { syncHeartbeatConfig, toggleFocusMode: rawToggleFocusMode } = useHeartbeat({
    isStreaming,
    onNotification: handleHeartbeatNotification,
  });

  const handleToggleFocusMode = useCallback(() => {
    rawToggleFocusMode();
    setFocusMode(getConfig().heartbeat?.focusMode ?? false);
  }, [rawToggleFocusMode]);

  const showWizard = loaded && !isConfigured() && !wizardDismissed;

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

  // TTS 自動読み上げ: ストリーミング終了時に最新 AI メッセージを読み上げ
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;
    if (!webSpeech.ttsAutoRead || !speechOutput.isSupported || isStreaming || !wasStreaming) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && lastMsg.content) {
      speechOutput.speak(lastMsg.content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  // メッセージ送信時にタイトル自動設定 & touch
  const handleSend = useCallback(async (text: string, attachments?: PendingAttachment[]) => {
    if (!activeConversationId) return;

    try {
      // 最初のメッセージならタイトルを自動設定
      if (messages.length === 0) {
        const title = text.trim() ? text.slice(0, 30) : (attachments?.[0]?.file.name.slice(0, 30) ?? '添付ファイル');
        await rename(activeConversationId, title);
      }

      await sendMessage(text, attachments);
      // メッセージ数 +2（ユーザー + アシスタント）で touch
      await touch(activeConversationId, messages.length + 2);
    } catch (error) {
      console.error('[iAgent] メッセージ送信エラー:', error);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `エラー: ${error instanceof Error ? error.message : '送信に失敗しました'}`,
        timestamp: Date.now(),
        conversationId: activeConversationId,
      };
      setMessages((prev) => [...prev, errorMsg]);
      await saveMessage(errorMsg);
    }
  }, [activeConversationId, messages.length, sendMessage, rename, touch, setMessages]);

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
    setWizardDismissed(true);
    syncHeartbeatConfig();
    setHeartbeatEnabled(getConfig().heartbeat?.enabled ?? false);
    setFocusMode(getConfig().heartbeat?.focusMode ?? false);
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
    setFocusMode(getConfig().heartbeat?.focusMode ?? false);

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
            {heartbeatEnabled && (
              <button
                className={`btn-icon${focusMode ? ' focus-active' : ''}`}
                onClick={handleToggleFocusMode}
                title={focusMode ? 'フォーカスモード解除' : 'フォーカスモード（通知一時停止）'}
                aria-label={focusMode ? 'フォーカスモード解除' : 'フォーカスモード（通知一時停止）'}
                aria-pressed={focusMode}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  {focusMode ? (
                    <path d="M5.164 14H9.78c-.424.964-1.505 2-2.78 2s-2.356-1.036-2.78-2zm6.288-7c0-3.065-2.08-5.455-4.452-5.938V.5a.5.5 0 0 0-1 0v.562C3.67 1.545 1.592 3.935 1.592 7L0 13h4.5a.5.5 0 0 0 0-1H1.66l1.136-4.266A5.7 5.7 0 0 1 7 3c1.987 0 3.76 1.15 4.576 2.862L13.152 13H9.5a.5.5 0 0 0 0 1H14l-1.548-6zM14 1a.5.5 0 0 1 .354.146l.292.293a.5.5 0 0 1-.708.708L14 2.207l-.354.354a.5.5 0 0 1-.708-.708l.354-.354-.354-.353a.5.5 0 0 1 .708-.708L14 .793l.354-.354A.5.5 0 0 1 14.354.146zM1.5 3.5a.5.5 0 0 1 0-.708l.354-.353L1.5.793a.5.5 0 1 1 .708-.708l.353.354.354-.354a.5.5 0 1 1 .708.708L3.268 1.146l.354.354a.5.5 0 0 1-.708.708l-.354-.354-.354.354a.5.5 0 0 1-.708 0z" />
                  ) : (
                    <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5.002 5.002 0 0 1 13 6c0 .88.32 4.2 1.22 6z" />
                  )}
                </svg>
              </button>
            )}
            <button className="btn-icon" onClick={handleSidebarCreate} title="新しい会話">
              +
            </button>
            <MemoryPanel
              isOpen={memoryPanel.isOpen}
              memories={memoryPanel.memories}
              archivedMemories={memoryPanel.archivedMemories}
              selectedCategory={memoryPanel.selectedCategory}
              viewTab={memoryPanel.viewTab}
              isLoading={memoryPanel.isLoading}
              onToggle={memoryPanel.toggle}
              onClose={memoryPanel.close}
              onChangeCategory={memoryPanel.changeCategory}
              onChangeViewTab={memoryPanel.changeViewTab}
              onDelete={memoryPanel.handleDelete}
              onRestore={memoryPanel.handleRestore}
              onDeleteArchived={memoryPanel.handleDeleteArchived}
            />
            <FeedPanel
              isOpen={feedPanel.isOpen}
              items={feedPanel.items}
              feedMap={feedPanel.feedMap}
              selectedTier={feedPanel.selectedTier}
              isLoading={feedPanel.isLoading}
              unreadCount={feedPanel.unreadCount}
              onToggle={feedPanel.toggle}
              onClose={feedPanel.close}
              onChangeTier={feedPanel.changeTier}
              onMarkRead={feedPanel.handleMarkRead}
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
        <OfflineBanner isOnline={isOnline} />
        <main className="app-main">
          <ChatView
            messages={messages}
            isStreaming={isStreaming}
            activeTools={activeTools}
            isOnline={isOnline}
            onSend={handleSend}
            onStop={stopStreaming}
            webSpeechLang={webSpeech.lang}
            webSpeechSttEnabled={webSpeech.sttEnabled}
            speechOutput={speechOutput}
          />
        </main>
        <Suspense fallback={null}>
          {showWizard && <SetupWizard onComplete={handleWizardComplete} />}
          {settingsOpen && <SettingsModal open={settingsOpen} onClose={handleSettingsClose} />}
        </Suspense>
      </div>
    </div>
  );
}
