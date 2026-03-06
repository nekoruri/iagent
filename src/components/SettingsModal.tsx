import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getConfig,
  saveConfig,
  getDefaultHeartbeatConfig,
  getDefaultHeartbeatCostControlConfig,
  getDefaultOtelConfig,
  getDefaultProxyConfig,
  getDefaultPersonaConfig,
  getDefaultWebSpeechConfig,
  BUILTIN_HEARTBEAT_TASKS,
} from '../core/config';
import { isSpeechRecognitionSupported, isSpeechSynthesisSupported } from '../core/speechService';
import { mcpManager, type MCPConnectionStatus } from '../core/mcpManager';
import { getNotificationPermission, requestNotificationPermission } from '../core/notifier';
import { subscribePush, unsubscribePush, getPushSubscription, registerPeriodicSync, unregisterPeriodicSync } from '../core/pushSubscription';
import { loadActionLog, type ActionLogEntry } from '../store/heartbeatStore';
import { registerProxyToken } from '../core/corsProxy';
import { getUrlValidationError } from '../core/urlValidation';
import { isReadOnlyTool } from '../core/toolUtils';
import { isIOSSafari, isStandaloneMode } from '../core/installDetect';
import { applyTheme } from '../core/theme';
import { readFileAsText } from '../core/fileUtils';
import {
  exportDataPortability,
  importDataPortabilityFromJson,
  getDataPortabilityErrorMessage,
  type DataPortabilityCounts,
} from '../core/dataPortability';
import {
  applyPersonaPresetToConfig,
  buildPersonaPreset,
  parsePersonaPresetFromJson,
} from '../core/personaPreset';
import type {
  AppConfig,
  MCPServerConfig,
  HeartbeatConfig,
  HeartbeatCostControlConfig,
  HeartbeatTask,
  TaskSchedule,
  TaskRunCondition,
  OtelConfig,
  PushConfig,
  ProxyConfig,
  PersonaConfig,
  ThemeMode,
  SuggestionFrequency,
  WebSpeechConfig,
} from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface MCPPreset {
  id: string;
  label: string;
  category: string;
  serverName: string;
  urlTemplate: string;
  description: string;
}

type SectionId = 'basic' | 'agent' | 'mcp' | 'heartbeat' | 'speech' | 'proxy' | 'otel' | 'storage';
type ApiKeyField = 'openaiApiKey' | 'braveApiKey' | 'openWeatherMapApiKey';

const ALL_SECTIONS: SectionId[] = ['basic', 'agent', 'mcp', 'heartbeat', 'speech', 'proxy', 'otel', 'storage'];
const API_KEY_FIELDS: ApiKeyField[] = ['openaiApiKey', 'braveApiKey', 'openWeatherMapApiKey'];

const MCP_PRESETS: MCPPreset[] = [
  {
    id: 'github',
    label: 'GitHub',
    category: 'コード',
    serverName: 'github',
    urlTemplate: 'https://<your-github-mcp-endpoint>/mcp',
    description: 'Issue / PR の検索・更新を行うためのプリセット',
  },
  {
    id: 'notion',
    label: 'Notion',
    category: 'ナレッジ',
    serverName: 'notion',
    urlTemplate: 'https://<your-notion-mcp-endpoint>/mcp',
    description: 'Notion DB / ページ連携のためのプリセット',
  },
  {
    id: 'rss-reader',
    label: 'RSS Reader',
    category: '情報収集',
    serverName: 'rss-reader',
    urlTemplate: 'https://<your-rss-mcp-endpoint>/mcp',
    description: '外部 RSS 取得系 MCP の接続テンプレート',
  },
  {
    id: 'slack',
    label: 'Slack',
    category: 'コミュニケーション',
    serverName: 'slack',
    urlTemplate: 'https://<your-slack-mcp-endpoint>/mcp',
    description: 'Slack 検索 / 投稿連携のためのプリセット',
  },
  {
    id: 'gmail',
    label: 'Gmail',
    category: 'メール',
    serverName: 'gmail',
    urlTemplate: 'https://<your-gmail-mcp-endpoint>/mcp',
    description: 'Gmail 検索 / 送信連携のためのプリセット',
  },
  {
    id: 'google-calendar',
    label: 'Google Calendar',
    category: 'カレンダー',
    serverName: 'google-calendar',
    urlTemplate: 'https://<your-google-calendar-mcp-endpoint>/mcp',
    description: 'Google Calendar 連携のためのプリセット',
  },
];

const RECOMMENDED_MCP_PRESET_IDS = ['github', 'notion', 'rss-reader'];

function initOpenSections(): Record<SectionId, boolean> {
  return Object.fromEntries(ALL_SECTIONS.map((id) => [id, true])) as Record<SectionId, boolean>;
}

function initApiKeyDrafts(): Record<ApiKeyField, string> {
  return Object.fromEntries(API_KEY_FIELDS.map((key) => [key, ''])) as Record<ApiKeyField, string>;
}

function initApiKeyClearFlags(): Record<ApiKeyField, boolean> {
  return Object.fromEntries(API_KEY_FIELDS.map((key) => [key, false])) as Record<ApiKeyField, boolean>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusLabel(status: MCPConnectionStatus): { text: string; className: string } {
  switch (status) {
    case 'connected':
      return { text: '接続済み', className: 'mcp-status-connected' };
    case 'connecting':
      return { text: '接続中...', className: 'mcp-status-connecting' };
    case 'error':
      return { text: 'エラー', className: 'mcp-status-error' };
    default:
      return { text: '未接続', className: 'mcp-status-disconnected' };
  }
}

function formatPortabilitySummary(counts: DataPortabilityCounts): string {
  return `会話 ${counts.conversationMeta}件 / メッセージ ${counts.conversations}件 / 記憶 ${counts.memories}件 / 記憶アーカイブ ${counts.archivedMemories}件 / 添付 ${counts.attachments}件`;
}

function downloadTextFile(content: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.rel = 'noopener';

  if (typeof URL.createObjectURL === 'function') {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    return;
  }

  link.href = `data:application/json;charset=utf-8,${encodeURIComponent(content)}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function confirmSafely(message: string): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  try {
    return window.confirm(message);
  } catch {
    return true;
  }
}

function mergeMcpPresetServers(
  currentServers: MCPServerConfig[],
  presets: MCPPreset[],
): { nextServers: MCPServerConfig[]; added: MCPPreset[]; skipped: MCPPreset[] } {
  const existingNames = new Set(
    currentServers
      .map((server) => server.name.trim().toLowerCase())
      .filter((name) => name.length > 0),
  );
  const existingUrls = new Set(
    currentServers
      .map((server) => server.url.trim())
      .filter((url) => url.length > 0),
  );
  const nextServers = [...currentServers];
  const added: MCPPreset[] = [];
  const skipped: MCPPreset[] = [];

  for (const preset of presets) {
    const normalizedName = preset.serverName.trim().toLowerCase();
    const normalizedUrl = preset.urlTemplate.trim();
    const duplicatedByName = normalizedName.length > 0 && existingNames.has(normalizedName);
    const duplicatedByUrl = normalizedUrl.length > 0 && existingUrls.has(normalizedUrl);
    if (duplicatedByName || duplicatedByUrl) {
      skipped.push(preset);
      continue;
    }
    nextServers.push({
      id: crypto.randomUUID(),
      name: preset.serverName,
      url: preset.urlTemplate,
      enabled: false,
    });
    added.push(preset);
    existingNames.add(normalizedName);
    existingUrls.add(normalizedUrl);
  }

  return { nextServers, added, skipped };
}

function formatActionTypeLabel(type: string): string {
  switch (type) {
    case 'toggle-task':
      return 'タスク切替';
    case 'update-task-interval':
      return '間隔変更';
    case 'update-quiet-hours':
      return '静寂時間';
    case 'update-quiet-days':
      return '静寂曜日';
    default:
      return type;
  }
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: 'ダーク' },
  { value: 'light', label: 'ライト' },
  { value: 'system', label: 'システム' },
];

export function SettingsModal({ open, onClose }: Props) {
  const [config, setConfig] = useState<AppConfig>(getConfig);
  const [, setTick] = useState(0);
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(initOpenSections);
  const [otelHeadersText, setOtelHeadersText] = useState(() => JSON.stringify(config.otel?.headers ?? {}));
  const [pushStatus, setPushStatus] = useState<'idle' | 'subscribing' | 'unsubscribing' | 'error'>('idle');
  const [pushError, setPushError] = useState<string>('');
  const [hasPushSubscription, setHasPushSubscription] = useState(false);
  const [proxyMasterKey, setProxyMasterKey] = useState('');
  const [proxyStatus, setProxyStatus] = useState<'idle' | 'registering' | 'error'>('idle');
  const [proxyError, setProxyError] = useState<string>('');
  const [proxyDomainsText, setProxyDomainsText] = useState(() => config.proxy?.allowedDomains?.join(', ') ?? '');
  const [mcpToolsList, setMcpToolsList] = useState<Array<{ serverName: string; toolName: string }>>([]);
  const [storageInfo, setStorageInfo] = useState<{
    persistent: boolean;
    usage: number;
    quota: number;
  } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermission());
  const [mcpPresetMessage, setMcpPresetMessage] = useState('');
  const [mcpPresetMessageStatus, setMcpPresetMessageStatus] = useState<'success' | 'warning'>('success');
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<ApiKeyField, string>>(initApiKeyDrafts);
  const [apiKeyClearFlags, setApiKeyClearFlags] = useState<Record<ApiKeyField, boolean>>(initApiKeyClearFlags);
  const [securityPresetMessage, setSecurityPresetMessage] = useState('');
  const [securityPresetPushRetryNeeded, setSecurityPresetPushRetryNeeded] = useState(false);
  const [personaPresetStatus, setPersonaPresetStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [personaPresetMessage, setPersonaPresetMessage] = useState('');
  const [actionLogEntries, setActionLogEntries] = useState<ActionLogEntry[]>([]);
  const [actionLogError, setActionLogError] = useState('');
  const [actionLogRefreshing, setActionLogRefreshing] = useState(false);
  const [portabilityStatus, setPortabilityStatus] = useState<'idle' | 'exporting' | 'importing' | 'success' | 'error'>('idle');
  const [portabilityMessage, setPortabilityMessage] = useState('');
  const [needsReloadAfterImport, setNeedsReloadAfterImport] = useState(false);
  const personaPresetImportInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // MCPManager の状態変更をリッスン
  useEffect(() => {
    if (!open) return;
    return mcpManager.subscribe(() => setTick((t) => t + 1));
  }, [open]);

  const persona: PersonaConfig = config.persona ?? getDefaultPersonaConfig();
  const heartbeat = config.heartbeat ?? getDefaultHeartbeatConfig();
  const heartbeatCostControl: HeartbeatCostControlConfig = heartbeat.costControl ?? getDefaultHeartbeatCostControlConfig();
  const push: PushConfig = config.push ?? { enabled: false, serverUrl: '' };
  const proxy: ProxyConfig = config.proxy ?? getDefaultProxyConfig();
  const otel = config.otel ?? getDefaultOtelConfig();
  const webSpeech: WebSpeechConfig = config.webSpeech ?? getDefaultWebSpeechConfig();

  // Push Subscription 状態を初期化
  useEffect(() => {
    if (!open) return;
    getPushSubscription().then((sub) => setHasPushSubscription(!!sub));
  }, [open]);

  const refreshNotificationPermission = useCallback(() => {
    setNotificationPermission(getNotificationPermission());
  }, []);

  // 通知権限を定期チェック（ブラウザ側自動取り消し/設定変更に追従）
  useEffect(() => {
    if (!open) return;
    const handlePermissionMayChange = () => {
      refreshNotificationPermission();
    };
    const initialRefreshId = window.setTimeout(handlePermissionMayChange, 0);
    document.addEventListener('visibilitychange', handlePermissionMayChange);
    window.addEventListener('focus', handlePermissionMayChange);
    const timerId = window.setInterval(handlePermissionMayChange, 30_000);

    return () => {
      window.clearTimeout(initialRefreshId);
      document.removeEventListener('visibilitychange', handlePermissionMayChange);
      window.removeEventListener('focus', handlePermissionMayChange);
      window.clearInterval(timerId);
    };
  }, [open, refreshNotificationPermission]);

  // MCP ツール一覧を取得
  useEffect(() => {
    if (!open) return;
    mcpManager.getAvailableTools().then(setMcpToolsList).catch(() => setMcpToolsList([]));
  }, [open]);

  const loadActionLogEntries = useCallback(async () => {
    try {
      const entries = await loadActionLog();
      setActionLogEntries([...entries].sort((a, b) => b.timestamp - a.timestamp));
      setActionLogError('');
    } catch {
      setActionLogError('自動実行ログの読み込みに失敗しました。');
      setActionLogEntries([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const refreshId = window.setTimeout(() => {
      void loadActionLogEntries();
    }, 0);
    return () => window.clearTimeout(refreshId);
  }, [open, loadActionLogEntries]);

  useEffect(() => {
    if (!open) return;
    const resetId = window.setTimeout(() => {
      setApiKeyDrafts(initApiKeyDrafts());
      setApiKeyClearFlags(initApiKeyClearFlags());
      setSecurityPresetMessage('');
      setSecurityPresetPushRetryNeeded(false);
      setPersonaPresetStatus('idle');
      setPersonaPresetMessage('');
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [open]);

  // ストレージ情報を取得
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        if (!navigator.storage?.estimate) {
          setStorageInfo(null);
          return;
        }
        const [persisted, estimate] = await Promise.all([
          navigator.storage.persisted?.() ?? Promise.resolve(false),
          navigator.storage.estimate(),
        ]);
        setStorageInfo({
          persistent: persisted,
          usage: estimate.usage ?? 0,
          quota: estimate.quota ?? 0,
        });
      } catch {
        setStorageInfo(null);
      }
    })();
  }, [open]);

  const updatePersona = (patch: Partial<PersonaConfig>) => {
    setConfig((prev) => ({
      ...prev,
      persona: { ...(prev.persona ?? getDefaultPersonaConfig()), ...patch },
    }));
  };

  const updateWebSpeech = (patch: Partial<WebSpeechConfig>) => {
    setConfig((prev) => ({
      ...prev,
      webSpeech: { ...(prev.webSpeech ?? getDefaultWebSpeechConfig()), ...patch },
    }));
  };

  const updateProxy = (patch: Partial<ProxyConfig>) => {
    setConfig((prev) => ({
      ...prev,
      proxy: { ...(prev.proxy ?? getDefaultProxyConfig()), ...patch },
    }));
  };

  const handleProxyRegister = async () => {
    if (!proxy.serverUrl) {
      setProxyError('サーバーURLを入力してください');
      return;
    }
    if (!proxyMasterKey) {
      setProxyError('マスターキーを入力してください');
      return;
    }
    setProxyStatus('registering');
    setProxyError('');
    try {
      const token = await registerProxyToken(proxy.serverUrl, proxyMasterKey);
      updateProxy({ authToken: token, enabled: true });
      setProxyMasterKey(''); // マスターキーは保存しない
      setProxyStatus('idle');
    } catch (error) {
      setProxyError(error instanceof Error ? error.message : String(error));
      setProxyStatus('error');
    }
  };

  const updateOtel = (patch: Partial<OtelConfig>) => {
    setConfig((prev) => ({
      ...prev,
      otel: { ...otel, ...patch },
    }));
  };

  const updatePush = (patch: Partial<PushConfig>) => {
    setConfig((prev) => ({
      ...prev,
      push: { ...push, ...patch },
    }));
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) {
      if (!push.serverUrl) {
        setPushError('サーバーURLを入力してください');
        return;
      }
      setPushStatus('subscribing');
      setPushError('');
      try {
        await subscribePush(push.serverUrl);
        updatePush({ enabled: true });
        setHasPushSubscription(true);
        // Periodic Sync もフォールバックとして登録
        await registerPeriodicSync();
        setPushStatus('idle');
      } catch (error) {
        setPushError(error instanceof Error ? error.message : String(error));
        setPushStatus('error');
      }
    } else {
      setPushStatus('unsubscribing');
      setPushError('');
      try {
        await unsubscribePush(push.serverUrl);
        await unregisterPeriodicSync();
        updatePush({ enabled: false });
        setHasPushSubscription(false);
        setPushStatus('idle');
      } catch (error) {
        setPushError(error instanceof Error ? error.message : String(error));
        setPushStatus('error');
      }
    }
  };

  const updateHeartbeat = (patch: Partial<HeartbeatConfig>) => {
    setConfig((prev) => ({
      ...prev,
      heartbeat: { ...heartbeat, ...patch },
    }));
  };

  const updateHeartbeatCostControl = (patch: Partial<HeartbeatCostControlConfig>) => {
    updateHeartbeat({
      costControl: {
        ...heartbeatCostControl,
        ...patch,
      },
    });
  };

  const updateHeartbeatTask = (taskId: string, patch: Partial<HeartbeatTask>) => {
    updateHeartbeat({
      tasks: heartbeat.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    });
  };

  const addCustomTask = () => {
    const newTask: HeartbeatTask = {
      id: crypto.randomUUID(),
      name: '',
      description: '',
      enabled: true,
      type: 'custom',
    };
    updateHeartbeat({ tasks: [...heartbeat.tasks, newTask] });
  };

  const removeCustomTask = (taskId: string) => {
    updateHeartbeat({ tasks: heartbeat.tasks.filter((t) => t.id !== taskId) });
  };

  const applyApiKeyDrafts = useCallback((currentConfig: AppConfig): AppConfig => {
    const nextConfig = { ...currentConfig };
    for (const key of API_KEY_FIELDS) {
      if (apiKeyClearFlags[key]) {
        nextConfig[key] = '';
        continue;
      }
      const draft = apiKeyDrafts[key].trim();
      if (draft.length > 0) {
        nextConfig[key] = draft;
      }
    }
    return nextConfig;
  }, [apiKeyDrafts, apiKeyClearFlags]);

  const handleSave = useCallback(async () => {
    // 有効な MCP サーバーの URL をバリデーション
    const invalidServer = config.mcpServers.find(
      (s) => s.enabled && s.url && getUrlValidationError(s.url)
    );
    if (invalidServer) {
      return; // URL バリデーションエラーがある場合は保存しない
    }
    const nextConfig = applyApiKeyDrafts(config);
    saveConfig(nextConfig);
    await mcpManager.syncWithConfig(nextConfig.mcpServers);
    onClose();
  }, [applyApiKeyDrafts, config, onClose]);

  const updateApiKeyDraft = (key: ApiKeyField, value: string) => {
    setApiKeyDrafts((prev) => ({ ...prev, [key]: value }));
    if (value.trim().length > 0) {
      setApiKeyClearFlags((prev) => ({ ...prev, [key]: false }));
    }
  };

  const toggleApiKeyClearFlag = (key: ApiKeyField) => {
    setApiKeyDrafts((prev) => ({ ...prev, [key]: '' }));
    setApiKeyClearFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getApiKeyStatusText = (key: ApiKeyField): string => {
    if (apiKeyClearFlags[key]) return '保存時に削除されます。';
    if (apiKeyDrafts[key].trim().length > 0) return '保存時に更新されます。';
    if (config[key].trim().length > 0) return '保存済み。変更しない場合は再入力不要です。';
    return '未設定。必要な場合のみ入力してください。';
  };

  const runLeastPrivilegePushCleanup = useCallback(async (): Promise<{
    hadSubscription: boolean;
    serverError: string;
    localError: string;
  }> => {
    const activeSubscription = await getPushSubscription();
    const hadSubscription = hasPushSubscription || !!activeSubscription;
    let serverError = '';
    let localError = '';
    let localUnsubscribeHandled = false;

    setPushStatus('unsubscribing');
    setPushError('');

    if (activeSubscription && push.serverUrl) {
      try {
        await unsubscribePush(push.serverUrl);
        localUnsubscribeHandled = true;
      } catch (error) {
        serverError = error instanceof Error ? error.message : String(error);
      }
    }

    if (activeSubscription && !localUnsubscribeHandled) {
      try {
        const unsubscribed = await activeSubscription.unsubscribe();
        if (!unsubscribed) {
          localError = 'ローカルの Push 購読解除に失敗しました。';
        }
      } catch (error) {
        localError = error instanceof Error ? error.message : String(error);
      }
    }

    try {
      await unregisterPeriodicSync();
    } catch (error) {
      const periodicError = error instanceof Error ? error.message : String(error);
      localError = localError ? `${localError} / ${periodicError}` : periodicError;
    }

    const mergedError = [serverError, localError].filter((msg) => msg.length > 0).join(' / ');
    if (!localError) {
      setHasPushSubscription(false);
      setPushStatus('idle');
    } else {
      setPushStatus('error');
    }
    setPushError(mergedError);

    return { hadSubscription, serverError, localError };
  }, [hasPushSubscription, push.serverUrl]);

  const handleRetryLeastPrivilegePushCleanup = async () => {
    const result = await runLeastPrivilegePushCleanup();
    if (result.localError) {
      setSecurityPresetPushRetryNeeded(true);
      setSecurityPresetMessage('Push 購読の解除に失敗しました。時間をおいて再試行してください。');
      return;
    }

    setConfig((prev) => ({
      ...prev,
      push: { ...(prev.push ?? { enabled: false, serverUrl: '' }), enabled: false },
    }));
    setSecurityPresetPushRetryNeeded(false);
    setSecurityPresetMessage(
      result.serverError
        ? 'Push 購読のローカル解除は完了しました（サーバー側解除は失敗の可能性があります）。'
        : 'Push 購読の解除に成功しました。',
    );
  };

  const handleApplyLeastPrivilegePreset = async () => {
    const nextHeartbeat = {
      ...heartbeat,
      enabled: false,
      desktopNotification: false,
    };
    const nextWebSpeech = {
      ...webSpeech,
      sttEnabled: false,
      ttsEnabled: false,
      ttsAutoRead: false,
    };
    const nextProxy = {
      ...proxy,
      enabled: false,
    };
    const disabledMcpCount = config.mcpServers.filter((server) => server.enabled).length;
    const nextMcpServers = config.mcpServers.map((server) =>
      server.enabled ? { ...server, enabled: false } : server
    );
    const pushCleanupResult = await runLeastPrivilegePushCleanup();
    const pushSettingChangedCount = Number(push.enabled && !pushCleanupResult.localError);
    const pushSubscriptionChangedCount = Number(
      !push.enabled
      && pushCleanupResult.hadSubscription
      && !pushCleanupResult.localError,
    );
    const changedCount = Number(heartbeat.enabled)
      + Number(heartbeat.desktopNotification)
      + Number(webSpeech.sttEnabled)
      + Number(webSpeech.ttsEnabled)
      + Number(webSpeech.ttsAutoRead)
      + Number(proxy.enabled)
      + pushSettingChangedCount
      + pushSubscriptionChangedCount
      + disabledMcpCount;

    setConfig((prev) => ({
      ...prev,
      heartbeat: nextHeartbeat,
      webSpeech: nextWebSpeech,
      proxy: nextProxy,
      push: {
        ...(prev.push ?? { enabled: false, serverUrl: '' }),
        enabled: pushCleanupResult.localError ? (prev.push?.enabled ?? false) : false,
      },
      mcpServers: nextMcpServers,
    }));
    setSecurityPresetPushRetryNeeded(Boolean(pushCleanupResult.localError));

    const baseMessage = changedCount === 0
      ? '既に最小権限設定です。'
      : `最小権限プリセットを適用しました（${changedCount}項目を変更）。`;
    const pushDetailMessage = pushCleanupResult.localError
      ? ' Push 購読の解除に失敗しました。下の「Push 解除を再試行」で再実行してください。'
      : pushCleanupResult.serverError
        ? ' Push 購読のローカル解除は完了しました（サーバー側解除は失敗の可能性があります）。'
        : (!push.enabled && pushCleanupResult.hadSubscription)
          ? ' Push 購読も解除しました。'
          : '';
    setSecurityPresetMessage(
      `${baseMessage}${pushDetailMessage}`,
    );
  };

  const addMCPServer = () => {
    const newServer: MCPServerConfig = {
      id: crypto.randomUUID(),
      name: '',
      url: '',
      enabled: true,
    };
    setConfig((prev) => ({
      ...prev,
      mcpServers: [...prev.mcpServers, newServer],
    }));
  };

  const updateMCPServer = (id: string, patch: Partial<MCPServerConfig>) => {
    setConfig((prev) => ({
      ...prev,
      mcpServers: prev.mcpServers.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const removeMCPServer = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      mcpServers: prev.mcpServers.filter((s) => s.id !== id),
    }));
  };

  const handleAddMcpPreset = (presetIds: string[]) => {
    const selected = MCP_PRESETS.filter((preset) => presetIds.includes(preset.id));
    if (selected.length === 0) return;

    const result = mergeMcpPresetServers(config.mcpServers, selected);
    if (result.added.length === 0) {
      setMcpPresetMessageStatus('warning');
      setMcpPresetMessage('選択したプリセットはすべて追加済みです。');
      return;
    }

    setConfig((prev) => ({
      ...prev,
      mcpServers: result.nextServers,
    }));

    const addedLabels = result.added.map((preset) => preset.label).join(' / ');
    const skippedText = result.skipped.length > 0
      ? `（${result.skipped.length}件は既存のためスキップ）`
      : '';
    setMcpPresetMessageStatus('success');
    setMcpPresetMessage(`${addedLabels} を追加しました。${skippedText}`.trim());
  };

  const handleExportPersonaPreset = () => {
    try {
      const preset = buildPersonaPreset(config);
      const now = new Date();
      const stamp = [
        now.getFullYear().toString().padStart(4, '0'),
        (now.getMonth() + 1).toString().padStart(2, '0'),
        now.getDate().toString().padStart(2, '0'),
        now.getHours().toString().padStart(2, '0'),
        now.getMinutes().toString().padStart(2, '0'),
      ].join('');
      const filename = `iagent-persona-preset-${stamp}.json`;
      downloadTextFile(JSON.stringify(preset, null, 2), filename);
      setPersonaPresetStatus('success');
      setPersonaPresetMessage(`ペルソナプリセットをエクスポートしました（${filename}）。`);
    } catch (error) {
      setPersonaPresetStatus('error');
      setPersonaPresetMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handlePickPersonaPresetFile = () => {
    personaPresetImportInputRef.current?.click();
  };

  const handleImportPersonaPresetFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const json = await readFileAsText(file);
      const preset = parsePersonaPresetFromJson(json);
      setConfig((prev) => applyPersonaPresetToConfig(prev, preset));
      setPersonaPresetStatus('success');
      if (preset.recommendedTaskIds && preset.recommendedTaskIds.length > 0) {
        setPersonaPresetMessage(`ペルソナプリセットを適用しました（推奨タスク ${preset.recommendedTaskIds.length} 件）。`);
      } else {
        setPersonaPresetMessage('ペルソナプリセットを適用しました。');
      }
    } catch (error) {
      setPersonaPresetStatus('error');
      setPersonaPresetMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleExportData = async () => {
    setPortabilityStatus('exporting');
    setPortabilityMessage('バックアップを作成しています...');
    setNeedsReloadAfterImport(false);
    try {
      const result = await exportDataPortability();
      downloadTextFile(result.json, result.filename);
      setPortabilityStatus('success');
      setPortabilityMessage(`エクスポート完了: ${result.filename}（${formatBytes(result.bytes)} / ${formatPortabilitySummary(result.counts)}）`);
    } catch (error) {
      setPortabilityStatus('error');
      setPortabilityMessage(getDataPortabilityErrorMessage(error));
    }
  };

  const handlePickImportFile = () => {
    importFileInputRef.current?.click();
  };

  const handleRefreshActionLog = async () => {
    setActionLogRefreshing(true);
    await loadActionLogEntries();
    setActionLogRefreshing(false);
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!confirmSafely('現在の設定・会話・記憶データを上書きして復元します。続行しますか？')) {
      return;
    }
    setPortabilityStatus('importing');
    setPortabilityMessage('バックアップを読み込んでいます...');
    setNeedsReloadAfterImport(false);
    try {
      const json = await readFileAsText(file);
      const result = await importDataPortabilityFromJson(json);
      setPortabilityStatus('success');
      setPortabilityMessage(`インポート完了: ${formatPortabilitySummary(result.counts)} を復元しました。`);
      setNeedsReloadAfterImport(true);
    } catch (error) {
      setPortabilityStatus('error');
      setPortabilityMessage(getDataPortabilityErrorMessage(error));
    }
  };

  if (!open) return null;

  const builtinTasks = heartbeat.tasks.filter((t) => t.type === 'builtin');
  const customTasks = heartbeat.tasks.filter((t) => t.type === 'custom');
  const canEnablePush = notificationPermission === 'granted';
  const isDesktopNotificationChecked = heartbeat.desktopNotification && notificationPermission === 'granted';
  const isDesktopNotificationDisabled = notificationPermission === 'denied' || notificationPermission === 'unsupported';

  const permissionStatusLabel = (() => {
    switch (notificationPermission) {
      case 'granted':
        return { text: '通知権限: 許可済み', className: 'mcp-status-connected' };
      case 'denied':
        return { text: '通知権限: ブロック中', className: 'mcp-status-error' };
      case 'unsupported':
        return { text: '通知権限: 非対応', className: 'mcp-status-warning' };
      default:
        return { text: '通知権限: 未設定', className: 'mcp-status-warning' };
    }
  })();

  const permissionRecoveryMessage = (() => {
    switch (notificationPermission) {
      case 'granted':
        return '通知権限は許可済みです。通知が届かない場合は OS 側の通知設定（集中モード/通知許可）を確認してください。';
      case 'denied':
        return '通知がブロックされています。ブラウザのサイト設定でこのサイトの通知を「許可」に変更し、再度「権限を再確認」を押してください。';
      case 'unsupported':
        return 'このブラウザは通知をサポートしていません。Push/デスクトップ通知を使う場合は対応ブラウザを利用してください。';
      default:
        return '通知権限は未設定です。「デスクトップ通知」を ON にして、ブラウザの許可ダイアログで許可してください。';
    }
  })();

  const normalizedDailyTokenBudget = (() => {
    const raw = Number(heartbeatCostControl.dailyTokenBudget);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(50000, Math.max(0, Math.floor(raw)));
  })();

  const normalizedPressureThresholdPercent = (() => {
    const raw = Number(heartbeatCostControl.pressureThreshold);
    const base = Number.isFinite(raw) ? raw : 0.8;
    const clamped = Math.min(0.95, Math.max(0.5, base));
    return Math.round(clamped * 100);
  })();

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSummaryClick = (id: SectionId) => (e: React.MouseEvent) => {
    // details のネイティブ開閉を常に抑止し、state で制御する
    e.preventDefault();
    const target = e.target as HTMLElement;
    // summary 内のボタン・トグルクリック時は開閉しない
    if (target.closest('button, label, input')) return;
    toggleSection(id);
  };

  return (
    <div className="modal-overlay settings-modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>設定</h2>
        </div>

        <div className="modal-body">
          {/* セクション 1: 基本設定 */}
          <details className="settings-section" open={openSections.basic}>
            <summary onClick={handleSummaryClick('basic')}>基本設定</summary>
            <div className="settings-section-content">
              <div className="theme-section">
                <span className="theme-section-label">テーマ</span>
                <div className="theme-selector">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={(config.theme ?? 'system') === opt.value ? 'active' : ''}
                      onClick={() => {
                        setConfig((prev) => {
                          const next = { ...prev, theme: opt.value };
                          saveConfig(next);
                          return next;
                        });
                        applyTheme(opt.value);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label>
                OpenAI API Key <span className="required">*必須</span>
                <input
                  type="password"
                  value={apiKeyDrafts.openaiApiKey}
                  onChange={(e) => updateApiKeyDraft('openaiApiKey', e.target.value)}
                  placeholder={config.openaiApiKey && !apiKeyClearFlags.openaiApiKey
                    ? '保存済み（変更する場合のみ入力）'
                    : 'sk-...'}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="api-key-actions">
                  <p className={`mcp-hint api-key-status ${apiKeyClearFlags.openaiApiKey ? 'api-key-status-danger' : ''}`}>
                    {getApiKeyStatusText('openaiApiKey')}
                  </p>
                  {config.openaiApiKey && (
                    <button
                      type="button"
                      className="btn-secondary btn-small api-key-clear-btn"
                      onClick={() => toggleApiKeyClearFlag('openaiApiKey')}
                    >
                      {apiKeyClearFlags.openaiApiKey ? '削除を取り消す' : '保存済みキーを削除'}
                    </button>
                  )}
                </div>
              </label>

              <label>
                Brave Search API Key
                <input
                  type="password"
                  value={apiKeyDrafts.braveApiKey}
                  onChange={(e) => updateApiKeyDraft('braveApiKey', e.target.value)}
                  placeholder={config.braveApiKey && !apiKeyClearFlags.braveApiKey
                    ? '保存済み（変更する場合のみ入力）'
                    : 'BSA...'}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="api-key-actions">
                  <p className={`mcp-hint api-key-status ${apiKeyClearFlags.braveApiKey ? 'api-key-status-danger' : ''}`}>
                    {getApiKeyStatusText('braveApiKey')}
                  </p>
                  {config.braveApiKey && (
                    <button
                      type="button"
                      className="btn-secondary btn-small api-key-clear-btn"
                      onClick={() => toggleApiKeyClearFlag('braveApiKey')}
                    >
                      {apiKeyClearFlags.braveApiKey ? '削除を取り消す' : '保存済みキーを削除'}
                    </button>
                  )}
                </div>
              </label>

              <label>
                OpenWeatherMap API Key
                <input
                  type="password"
                  value={apiKeyDrafts.openWeatherMapApiKey}
                  onChange={(e) => updateApiKeyDraft('openWeatherMapApiKey', e.target.value)}
                  placeholder={config.openWeatherMapApiKey && !apiKeyClearFlags.openWeatherMapApiKey
                    ? '保存済み（変更する場合のみ入力）'
                    : '...'}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="api-key-actions">
                  <p className={`mcp-hint api-key-status ${apiKeyClearFlags.openWeatherMapApiKey ? 'api-key-status-danger' : ''}`}>
                    {getApiKeyStatusText('openWeatherMapApiKey')}
                  </p>
                  {config.openWeatherMapApiKey && (
                    <button
                      type="button"
                      className="btn-secondary btn-small api-key-clear-btn"
                      onClick={() => toggleApiKeyClearFlag('openWeatherMapApiKey')}
                    >
                      {apiKeyClearFlags.openWeatherMapApiKey ? '削除を取り消す' : '保存済みキーを削除'}
                    </button>
                  )}
                </div>
              </label>

              <div className="security-preset-section">
                <h4>セキュリティ（PoC）</h4>
                <p className="mcp-hint">
                  最小権限プリセットで通知・音声・MCP 接続などを一括で無効化できます。
                </p>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={handleApplyLeastPrivilegePreset}
                >
                  最小権限プリセットを適用
                </button>
                {securityPresetPushRetryNeeded && (
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={handleRetryLeastPrivilegePushCleanup}
                  >
                    Push 解除を再試行
                  </button>
                )}
                {securityPresetMessage && <p className="mcp-hint">{securityPresetMessage}</p>}
                <p className="mcp-hint">
                  Push 購読が存在する場合、プリセット適用時に自動解除します（失敗時は「Push 解除を再試行」を使用）。
                </p>
              </div>
            </div>
          </details>

          {/* セクション 2: エージェント設定 */}
          <details className="settings-section" open={openSections.agent}>
            <summary onClick={handleSummaryClick('agent')}>エージェント設定</summary>
            <div className="settings-section-content">
              <p className="mcp-hint">エージェントの名前や性格をカスタマイズできます。</p>

              <label>
                エージェント名
                <input
                  type="text"
                  value={persona.name}
                  onChange={(e) => updatePersona({ name: e.target.value })}
                  placeholder="iAgent"
                />
              </label>

              <label>
                性格・特徴
                <input
                  type="text"
                  value={persona.personality}
                  onChange={(e) => updatePersona({ personality: e.target.value })}
                  placeholder="例: 丁寧で親しみやすい"
                />
              </label>

              <label>
                話し方
                <input
                  type="text"
                  value={persona.tone}
                  onChange={(e) => updatePersona({ tone: e.target.value })}
                  placeholder="例: カジュアル"
                />
              </label>

              <label>
                追加指示
                <textarea
                  value={persona.customInstructions}
                  onChange={(e) => updatePersona({ customInstructions: e.target.value })}
                  placeholder="エージェントへの追加指示を自由に記述"
                  rows={3}
                />
              </label>

              <label className="hb-range-label">
                チャット内サジェスト:
                <select
                  value={config.suggestionFrequency ?? 'high'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, suggestionFrequency: e.target.value as SuggestionFrequency }))}
                >
                  <option value="high">高（memory + clip + feed）</option>
                  <option value="medium">中（memory のみ）</option>
                  <option value="low">低（最小限）</option>
                </select>
              </label>

              <div className="security-preset-section">
                <h4>ペルソナプリセット（配布 / インポート）</h4>
                <p className="mcp-hint">
                  現在の persona・提案頻度・有効なビルトインタスクを JSON として書き出し、別環境へ読み込めます。
                </p>
                <div className="storage-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={handleExportPersonaPreset}
                  >
                    ペルソナプリセットをエクスポート
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={handlePickPersonaPresetFile}
                  >
                    ペルソナプリセットをインポート
                  </button>
                </div>
                {personaPresetMessage && (
                  <p className={`mcp-hint ${personaPresetStatus === 'error' ? 'mcp-error-text' : ''}`}>
                    {personaPresetMessage}
                  </p>
                )}
                <input
                  ref={personaPresetImportInputRef}
                  data-testid="persona-preset-import-input"
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={handleImportPersonaPresetFileChange}
                />
              </div>
            </div>
          </details>

          {/* セクション 3: MCP Servers */}
          <details className="settings-section" open={openSections.mcp}>
            <summary onClick={handleSummaryClick('mcp')}>
              <span>MCP Servers</span>
              <button className="btn-secondary btn-small" onClick={addMCPServer}>+ 追加</button>
            </summary>
            <div className="settings-section-content">
              <p className="mcp-hint">MCPサーバーのツールをAgentから利用できます。サーバー側でCORSを許可してください。</p>
              <div className="mcp-preset-box">
                <div className="mcp-preset-header">
                  <span className="mcp-preset-title">クイック追加（MCPプリセット）</span>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => handleAddMcpPreset(RECOMMENDED_MCP_PRESET_IDS)}
                  >
                    推奨セットを追加
                  </button>
                </div>
                <p className="mcp-hint">
                  推奨セット（GitHub / Notion / RSS Reader）をワンクリックで追加できます。
                  URL は各 MCP サーバー環境に合わせて編集してください。
                </p>
                <div className="mcp-preset-grid">
                  {MCP_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="mcp-preset-btn"
                      onClick={() => handleAddMcpPreset([preset.id])}
                    >
                      <div className="mcp-preset-btn-top">
                        <span>{preset.label}</span>
                        <span className="mcp-status mcp-status-disconnected">{preset.category}</span>
                      </div>
                      <span className="mcp-preset-btn-description">{preset.description}</span>
                    </button>
                  ))}
                </div>
                {mcpPresetMessage && (
                  <p className={`mcp-preset-message ${mcpPresetMessageStatus}`}>
                    {mcpPresetMessage}
                  </p>
                )}
              </div>

              {config.mcpServers.length === 0 && (
                <p className="mcp-empty">MCPサーバーが未登録です</p>
              )}

              {config.mcpServers.map((server) => {
                const status = mcpManager.getStatus(server.id);
                const { text: statusText, className: statusClass } = statusLabel(status);
                const error = mcpManager.getError(server.id);

                return (
                  <div className="mcp-server-card" key={server.id}>
                    <div className="mcp-server-row">
                      <input
                        className="mcp-server-name"
                        type="text"
                        value={server.name}
                        onChange={(e) => updateMCPServer(server.id, { name: e.target.value.replace(/\//g, '') })}
                        placeholder="サーバー名"
                      />
                      <span className={`mcp-status ${statusClass}`}>{statusText}</span>
                    </div>
                    <input
                      className="mcp-server-url"
                      type="text"
                      value={server.url}
                      onChange={(e) => updateMCPServer(server.id, { url: e.target.value })}
                      placeholder="https://example.com/mcp"
                    />
                    {server.url && getUrlValidationError(server.url) && (
                      <p className="mcp-error-text">{getUrlValidationError(server.url)}</p>
                    )}
                    {error && <p className="mcp-error-text">{error}</p>}
                    <div className="mcp-server-actions">
                      <label className="mcp-toggle-label">
                        <input
                          type="checkbox"
                          checked={server.enabled}
                          onChange={(e) => updateMCPServer(server.id, { enabled: e.target.checked })}
                        />
                        有効
                      </label>
                      <button
                        className="btn-danger btn-small"
                        onClick={() => removeMCPServer(server.id)}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>

          {/* セクション 4: Heartbeat */}
          <details className="settings-section" open={openSections.heartbeat}>
            <summary onClick={handleSummaryClick('heartbeat')}>
              <span>Heartbeat</span>
              <label className="hb-toggle-label" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <input
                  type="checkbox"
                  checked={heartbeat.enabled}
                  onChange={(e) => updateHeartbeat({ enabled: e.target.checked })}
                />
                有効
              </label>
            </summary>
            <div className="settings-section-content">
              <p className="mcp-hint">定期的にバックグラウンドチェックを実行し、変化があればチャットに通知します。</p>

              <div className="hb-notification-row">
                <label className="mcp-toggle-label">
                  <input
                    type="checkbox"
                    checked={isDesktopNotificationChecked}
                    disabled={isDesktopNotificationDisabled}
                    onChange={async (e) => {
                      if (e.target.checked) {
                        const result = await requestNotificationPermission();
                        setNotificationPermission(result);
                        updateHeartbeat({ desktopNotification: result === 'granted' });
                      } else {
                        updateHeartbeat({ desktopNotification: false });
                      }
                    }}
                  />
                  デスクトップ通知
                </label>
                <span className={`mcp-status ${permissionStatusLabel.className}`}>{permissionStatusLabel.text}</span>
                <p className={`hb-notification-help ${notificationPermission === 'granted' ? 'hb-notification-help-ok' : 'hb-notification-help-alert'}`}>
                  {permissionRecoveryMessage}
                </p>
                <div className="hb-notification-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={refreshNotificationPermission}
                  >
                    権限を再確認
                  </button>
                </div>
              </div>

              <label className="hb-range-label">
                チェック間隔: {heartbeat.intervalMinutes}分
                <input
                  type="range"
                  min={1}
                  max={120}
                  step={1}
                  value={heartbeat.intervalMinutes}
                  onChange={(e) => updateHeartbeat({ intervalMinutes: Number(e.target.value) })}
                />
              </label>

              <div className="hb-quiet-hours">
                <span className="hb-quiet-label">深夜スキップ:</span>
                <select
                  value={heartbeat.quietHoursStart}
                  onChange={(e) => updateHeartbeat({ quietHoursStart: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i}:00</option>
                  ))}
                </select>
                <span>〜</span>
                <select
                  value={heartbeat.quietHoursEnd}
                  onChange={(e) => updateHeartbeat({ quietHoursEnd: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i}:00</option>
                  ))}
                </select>
              </div>

              <div className="hb-quiet-days">
                <span className="hb-quiet-label">スキップ曜日:</span>
                <div className="hb-day-checkboxes">
                  {['日', '月', '火', '水', '木', '金', '土'].map((label, i) => (
                    <label key={i} className="hb-day-checkbox">
                      <input
                        type="checkbox"
                        checked={heartbeat.quietDays?.includes(i) ?? false}
                        onChange={(e) => {
                          const current = heartbeat.quietDays ?? [];
                          const updated = e.target.checked
                            ? [...current, i]
                            : current.filter(d => d !== i);
                          updateHeartbeat({ quietDays: updated });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="hb-range-label">
                日次通知上限: {heartbeat.maxNotificationsPerDay === 0 ? '無制限' : `${heartbeat.maxNotificationsPerDay}件`}
                <input
                  type="range"
                  min={0} max={30} step={1}
                  value={heartbeat.maxNotificationsPerDay ?? 0}
                  onChange={(e) => updateHeartbeat({ maxNotificationsPerDay: Number(e.target.value) })}
                />
              </label>

              <div className="hb-tasks-section">
                <h4>コスト制御（PoC）</h4>
                <label className="mcp-toggle-label">
                  <input
                    type="checkbox"
                    checked={heartbeatCostControl.enabled}
                    onChange={(e) => updateHeartbeatCostControl({ enabled: e.target.checked })}
                  />
                  コスト制御を有効化
                </label>
                <label className="hb-range-label">
                  日次トークン予算: {normalizedDailyTokenBudget === 0 ? '無制限' : `${normalizedDailyTokenBudget.toLocaleString()} tokens`}
                  <input
                    type="range"
                    min={0}
                    max={50000}
                    step={500}
                    value={normalizedDailyTokenBudget}
                    onChange={(e) => updateHeartbeatCostControl({ dailyTokenBudget: Number(e.target.value) })}
                  />
                </label>
                <label className="hb-range-label">
                  予算逼迫しきい値: {normalizedPressureThresholdPercent}%
                  <input
                    type="range"
                    min={50}
                    max={95}
                    step={5}
                    value={normalizedPressureThresholdPercent}
                    onChange={(e) => updateHeartbeatCostControl({ pressureThreshold: Number(e.target.value) / 100 })}
                  />
                </label>
                <label className="mcp-toggle-label">
                  <input
                    type="checkbox"
                    checked={heartbeatCostControl.deferNonCriticalTasks ?? true}
                    onChange={(e) => updateHeartbeatCostControl({ deferNonCriticalTasks: e.target.checked })}
                  />
                  予算逼迫時に非クリティカルタスクを次回回し
                </label>
                <p className="mcp-hint">
                  予算が逼迫すると、出力トークンを縮退し、必要に応じて低優先タスクを次回に回します。
                </p>
              </div>

              <div className="hb-action-log-section">
                <div className="hb-action-log-header">
                  <h4>自動実行ログ（Action Planning）</h4>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={handleRefreshActionLog}
                    disabled={actionLogRefreshing}
                  >
                    {actionLogRefreshing ? '更新中...' : '再読み込み'}
                  </button>
                </div>
                <p className="mcp-hint">
                  いつ、何を、なぜ変更したかを確認できます（最新20件を表示）。
                </p>
                {actionLogError && <p className="mcp-error-text">{actionLogError}</p>}
                {actionLogEntries.length === 0 ? (
                  <p className="mcp-hint">ログはまだありません。</p>
                ) : (
                  <div className="hb-action-log-list">
                    {actionLogEntries.slice(0, 20).map((entry) => (
                      <div key={`${entry.timestamp}-${entry.type}-${entry.reason}`} className="hb-action-log-item">
                        <div className="hb-action-log-meta">
                          <span className="mcp-status mcp-status-disconnected">{formatActionTypeLabel(entry.type)}</span>
                          <span className="hb-action-log-time">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="hb-action-log-reason">{entry.reason}</p>
                        <p className="hb-action-log-detail">{entry.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Push 通知設定（Layer 3） */}
              <div className="hb-push-section">
                <h4>バックグラウンド Push（タブ閉鎖後も動作）</h4>
                <p className="mcp-hint">
                  外部サーバーからの wake-up シグナルで、タブを閉じた後も定期チェックを継続します。
                </p>
                <p className="mcp-hint">
                  フォールバックの Periodic Background Sync はブラウザ実装依存です（Chrome/Edge では最短でも約12時間、iOS Safari は非対応）。
                </p>
                <label>
                  Push サーバーURL
                  <input
                    type="text"
                    value={push.serverUrl}
                    onChange={(e) => updatePush({ serverUrl: e.target.value })}
                    placeholder="https://your-worker.workers.dev"
                    disabled={pushStatus === 'subscribing' || pushStatus === 'unsubscribing'}
                  />
                  {push.serverUrl && getUrlValidationError(push.serverUrl) && (
                    <p className="mcp-error-text">{getUrlValidationError(push.serverUrl)}</p>
                  )}
                </label>
                <div className="hb-notification-row">
                  <label className="mcp-toggle-label">
                    <input
                      type="checkbox"
                      checked={push.enabled}
                      disabled={pushStatus === 'subscribing' || pushStatus === 'unsubscribing' || (!canEnablePush && !push.enabled)}
                      onChange={(e) => handlePushToggle(e.target.checked)}
                    />
                    {pushStatus === 'subscribing' ? '登録中...' :
                      pushStatus === 'unsubscribing' ? '解除中...' :
                        'Push 通知を有効化'}
                  </label>
                  {hasPushSubscription && push.enabled && (
                    <span className="mcp-status mcp-status-connected">登録済み</span>
                  )}
                </div>
                {pushError && <p className="mcp-error-text">{pushError}</p>}
                {!canEnablePush && !push.enabled && (
                  <p className="hb-notification-denied">Push 通知を有効化するには、先に通知権限を許可してください。</p>
                )}
                {isIOSSafari() && !isStandaloneMode() && (
                  <p className="mcp-hint storage-warning">
                    iOS で Push 通知を受け取るには、まずこのアプリをホーム画面に追加（PWA インストール）してください。
                  </p>
                )}
              </div>

              <div className="hb-tasks-section">
                <h4>ビルトインタスク</h4>
                {builtinTasks.map((task) => {
                  const builtinDef = BUILTIN_HEARTBEAT_TASKS.find((b) => b.id === task.id);
                  return (
                    <div className="hb-task-card" key={task.id}>
                      <label className="mcp-toggle-label">
                        <input
                          type="checkbox"
                          checked={task.enabled}
                          onChange={(e) => updateHeartbeatTask(task.id, { enabled: e.target.checked })}
                        />
                        {builtinDef?.name ?? task.name}
                      </label>
                      <p className="mcp-hint">{builtinDef?.description ?? task.description}</p>
                    </div>
                  );
                })}
              </div>

              <div className="hb-tasks-section">
                <div className="mcp-header">
                  <h4>カスタムタスク</h4>
                  <button className="btn-secondary btn-small" onClick={addCustomTask}>+ 追加</button>
                </div>
                {customTasks.length === 0 && (
                  <p className="mcp-empty">カスタムタスクなし</p>
                )}
                {customTasks.map((task) => {
                  const scheduleType = task.schedule?.type ?? 'global';
                  const conditionType = task.condition?.type ?? 'none';
                  const updateSchedule = (patch: Partial<TaskSchedule>) => {
                    const current = task.schedule ?? { type: 'global' as const };
                    updateHeartbeatTask(task.id, { schedule: { ...current, ...patch } });
                  };
                  const updateCondition = (patch: Partial<TaskRunCondition>) => {
                    if (!task.condition || task.condition.type !== 'time-window') return;
                    updateHeartbeatTask(task.id, {
                      condition: {
                        ...task.condition,
                        ...patch,
                      },
                    });
                  };

                  return (
                    <div className="mcp-server-card" key={task.id}>
                      <div className="mcp-server-row">
                        <input
                          className="mcp-server-name"
                          type="text"
                          value={task.name}
                          onChange={(e) => updateHeartbeatTask(task.id, { name: e.target.value })}
                          placeholder="タスク名"
                        />
                        <label className="mcp-toggle-label">
                          <input
                            type="checkbox"
                            checked={task.enabled}
                            onChange={(e) => updateHeartbeatTask(task.id, { enabled: e.target.checked })}
                          />
                          有効
                        </label>
                      </div>
                      <textarea
                        className="hb-task-description"
                        value={task.description}
                        onChange={(e) => updateHeartbeatTask(task.id, { description: e.target.value })}
                        placeholder="タスクの説明（エージェントへの指示）"
                        rows={2}
                      />
                      <div className="hb-schedule-row">
                        <span className="hb-schedule-label">スケジュール:</span>
                        <select
                          className="hb-schedule-select"
                          value={scheduleType}
                          onChange={(e) => {
                            const type = e.target.value as TaskSchedule['type'];
                            if (type === 'global') {
                              updateHeartbeatTask(task.id, { schedule: { type: 'global' } });
                            } else if (type === 'interval') {
                              updateHeartbeatTask(task.id, { schedule: { type: 'interval', intervalMinutes: 60 } });
                            } else {
                              updateHeartbeatTask(task.id, { schedule: { type: 'fixed-time', hour: 8, minute: 0 } });
                            }
                          }}
                        >
                          <option value="global">グローバル設定に従う</option>
                          <option value="interval">カスタム間隔</option>
                          <option value="fixed-time">毎日指定時刻</option>
                        </select>
                      </div>
                      {scheduleType === 'interval' && (
                        <div className="hb-schedule-detail">
                          <label className="hb-range-label">
                            間隔: {task.schedule?.intervalMinutes ?? 60}分
                            <input
                              type="range"
                              min={5}
                              max={240}
                              step={5}
                              value={task.schedule?.intervalMinutes ?? 60}
                              onChange={(e) => updateSchedule({ intervalMinutes: Number(e.target.value) })}
                            />
                          </label>
                        </div>
                      )}
                      {scheduleType === 'fixed-time' && (
                        <div className="hb-schedule-detail hb-schedule-time">
                          <span className="hb-schedule-label">実行時刻:</span>
                          <select
                            className="hb-schedule-select"
                            value={task.schedule?.hour ?? 8}
                            onChange={(e) => updateSchedule({ hour: Number(e.target.value) })}
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                            ))}
                          </select>
                          <span>:</span>
                          <select
                            className="hb-schedule-select"
                            value={task.schedule?.minute ?? 0}
                            onChange={(e) => updateSchedule({ minute: Number(e.target.value) })}
                          >
                            {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="hb-schedule-row">
                        <span className="hb-schedule-label">時間帯条件:</span>
                        <select
                          className="hb-schedule-select"
                          value={conditionType}
                          onChange={(e) => {
                            const type = e.target.value;
                            if (type === 'none') {
                              updateHeartbeatTask(task.id, { condition: undefined });
                              return;
                            }
                            updateHeartbeatTask(task.id, {
                              condition: task.condition?.type === 'time-window'
                                ? task.condition
                                : { type: 'time-window', startHour: 9, endHour: 18 },
                            });
                          }}
                        >
                          <option value="none">なし（常時実行可）</option>
                          <option value="time-window">時間帯指定</option>
                        </select>
                      </div>
                      {conditionType === 'time-window' && task.condition?.type === 'time-window' && (
                        <div className="hb-schedule-detail hb-schedule-time">
                          <span className="hb-schedule-label">実行可能時間:</span>
                          <select
                            className="hb-schedule-select"
                            value={task.condition.startHour}
                            onChange={(e) => updateCondition({ startHour: Number(e.target.value) })}
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={`c-start-${i}`} value={i}>{String(i).padStart(2, '0')}</option>
                            ))}
                          </select>
                          <span>〜</span>
                          <select
                            className="hb-schedule-select"
                            value={task.condition.endHour}
                            onChange={(e) => updateCondition({ endHour: Number(e.target.value) })}
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={`c-end-${i}`} value={i}>{String(i).padStart(2, '0')}</option>
                            ))}
                          </select>
                          <span className="mcp-hint">（start=end は終日実行可）</span>
                        </div>
                      )}
                      {/* MCP ツール許可設定 */}
                      {mcpToolsList.length > 0 && (() => {
                        const readOnlyTools = mcpToolsList.filter((t) => isReadOnlyTool(t.toolName));
                        if (readOnlyTools.length === 0) return null;
                        const allowedTools = task.allowedMcpTools ?? [];
                        return (
                          <div className="hb-mcp-tools-section">
                            <span className="hb-schedule-label">MCP ツール許可:</span>
                            <div className="hb-mcp-tools-list">
                              {readOnlyTools.map((t) => {
                                const qualifiedName = `${t.serverName}/${t.toolName}`;
                                // レガシー（"/" なし toolName のみ）も checked 判定に含める
                                const isChecked = allowedTools.includes(qualifiedName)
                                  || allowedTools.includes(t.toolName);
                                return (
                                <label key={qualifiedName} className="mcp-toggle-label hb-mcp-tool-label">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      // レガシーエントリを除去して qualified 形式に正規化
                                      const withoutLegacy = allowedTools.filter(
                                        (n) => n !== qualifiedName && n !== t.toolName,
                                      );
                                      const newAllowed = e.target.checked
                                        ? [...withoutLegacy, qualifiedName]
                                        : withoutLegacy;
                                      updateHeartbeatTask(task.id, { allowedMcpTools: newAllowed });
                                    }}
                                  />
                                  <span className="hb-mcp-tool-name">{t.toolName}</span>
                                  <span className="hb-mcp-tool-server">({t.serverName})</span>
                                </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      <div className="mcp-server-actions">
                        <div />
                        <button
                          className="btn-danger btn-small"
                          onClick={() => removeCustomTask(task.id)}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>

          {/* セクション 5: 音声入出力 */}
          <details className="settings-section" open={openSections.speech}>
            <summary onClick={handleSummaryClick('speech')}>音声入出力</summary>
            <div className="settings-section-content">
              <p className="mcp-hint">Web Speech API を使用した音声入力・読み上げ機能です。Chrome/Edge で最も安定して動作します。</p>

              <div className="hb-notification-row">
                <label className="mcp-toggle-label">
                  <input
                    type="checkbox"
                    checked={webSpeech.sttEnabled}
                    disabled={!isSpeechRecognitionSupported()}
                    onChange={(e) => updateWebSpeech({ sttEnabled: e.target.checked })}
                  />
                  音声入力（STT）
                </label>
                {!isSpeechRecognitionSupported() && (
                  <p className="hb-notification-denied">このブラウザは音声認識をサポートしていません。</p>
                )}
              </div>

              <div className="hb-notification-row">
                <label className="mcp-toggle-label">
                  <input
                    type="checkbox"
                    checked={webSpeech.ttsEnabled}
                    disabled={!isSpeechSynthesisSupported()}
                    onChange={(e) => updateWebSpeech({ ttsEnabled: e.target.checked })}
                  />
                  音声読み上げ（TTS）
                </label>
                {!isSpeechSynthesisSupported() && (
                  <p className="hb-notification-denied">このブラウザは音声合成をサポートしていません。</p>
                )}
              </div>

              {webSpeech.ttsEnabled && (
                <div className="hb-notification-row">
                  <label className="mcp-toggle-label">
                    <input
                      type="checkbox"
                      checked={webSpeech.ttsAutoRead}
                      onChange={(e) => updateWebSpeech({ ttsAutoRead: e.target.checked })}
                    />
                    AI 応答を自動読み上げ
                  </label>
                </div>
              )}

              {webSpeech.ttsEnabled && (
                <label className="hb-range-label">
                  読み上げ速度: {webSpeech.ttsRate.toFixed(1)}x
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={webSpeech.ttsRate}
                    onChange={(e) => updateWebSpeech({ ttsRate: Number(e.target.value) || 1.0 })}
                  />
                </label>
              )}

              <label className="hb-range-label">
                言語:
                <select
                  value={webSpeech.lang}
                  onChange={(e) => updateWebSpeech({ lang: e.target.value })}
                >
                  <option value="ja-JP">日本語</option>
                  <option value="en-US">英語（米国）</option>
                  <option value="en-GB">英語（英国）</option>
                  <option value="zh-CN">中国語（簡体）</option>
                  <option value="ko-KR">韓国語</option>
                </select>
              </label>
            </div>
          </details>

          {/* セクション 6: CORS プロキシ */}
          <details className="settings-section" open={openSections.proxy}>
            <summary onClick={handleSummaryClick('proxy')}>
              <span>CORS プロキシ</span>
              <label className="hb-toggle-label" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <input
                  type="checkbox"
                  checked={proxy.enabled}
                  onChange={(e) => updateProxy({ enabled: e.target.checked })}
                />
                有効
              </label>
            </summary>
            <div className="settings-section-content">
              <p className="mcp-hint">外部サーバー経由で CORS 制限を回避し、RSS フィードや Web ページを取得します。</p>

              <label>
                プロキシサーバーURL
                <input
                  type="text"
                  value={proxy.serverUrl}
                  onChange={(e) => updateProxy({ serverUrl: e.target.value })}
                  placeholder="https://your-worker.workers.dev"
                />
                {proxy.serverUrl && getUrlValidationError(proxy.serverUrl) && (
                  <p className="mcp-error-text">{getUrlValidationError(proxy.serverUrl)}</p>
                )}
              </label>

              {proxy.authToken ? (
                <div className="hb-notification-row">
                  <span className="mcp-status mcp-status-connected">トークン設定済み</span>
                  <button
                    className="btn-danger btn-small"
                    onClick={() => updateProxy({ authToken: '', enabled: false })}
                  >
                    トークン削除
                  </button>
                </div>
              ) : (
                <>
                  <label>
                    マスターキー（トークン取得用・保存されません）
                    <input
                      type="password"
                      value={proxyMasterKey}
                      onChange={(e) => setProxyMasterKey(e.target.value)}
                      placeholder="マスターキーを入力"
                      disabled={proxyStatus === 'registering'}
                    />
                  </label>
                  <button
                    className="btn-primary btn-small"
                    onClick={handleProxyRegister}
                    disabled={proxyStatus === 'registering' || !proxy.serverUrl || !proxyMasterKey}
                  >
                    {proxyStatus === 'registering' ? 'トークン取得中...' : 'トークン取得'}
                  </button>
                </>
              )}
              {proxyError && <p className="mcp-error-text">{proxyError}</p>}

              <label>
                許可ドメイン（カンマ区切り、空=全許可）
                <input
                  type="text"
                  value={proxyDomainsText}
                  onChange={(e) => {
                    setProxyDomainsText(e.target.value);
                    const domains = e.target.value
                      .split(',')
                      .map((d) => d.trim())
                      .filter((d) => d.length > 0);
                    updateProxy({ allowedDomains: domains });
                  }}
                  placeholder="example.com, news.ycombinator.com"
                />
              </label>
            </div>
          </details>

          {/* セクション 7: オブザーバビリティ */}
          <details className="settings-section" open={openSections.otel}>
            <summary onClick={handleSummaryClick('otel')}>
              <span>オブザーバビリティ</span>
              <label className="hb-toggle-label" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <input
                  type="checkbox"
                  checked={otel.enabled}
                  onChange={(e) => updateOtel({ enabled: e.target.checked })}
                />
                有効
              </label>
            </summary>
            <div className="settings-section-content">
              <p className="mcp-hint">トレースデータをIndexedDBに保存し、OTLP/HTTPで外部バックエンドに送信できます。</p>

              <label>
                OTLP エンドポイント
                <input
                  type="text"
                  value={otel.endpoint}
                  onChange={(e) => updateOtel({ endpoint: e.target.value })}
                  placeholder="/api/otel (開発時) or http://collector:4318"
                  disabled={!otel.enabled}
                />
              </label>

              <label>
                認証ヘッダー (JSON)
                <input
                  type="text"
                  value={otelHeadersText}
                  onChange={(e) => {
                    setOtelHeadersText(e.target.value);
                    try {
                      const parsed = JSON.parse(e.target.value);
                      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                        updateOtel({ headers: parsed });
                      }
                    } catch {
                      // 入力途中の不正な JSON は state のみ更新、config には反映しない
                    }
                  }}
                  placeholder='{"Authorization": "Bearer ..."}'
                  disabled={!otel.enabled}
                />
              </label>
            </div>
          </details>

          {/* セクション 8: ストレージ */}
          {storageInfo && (
            <details className="settings-section" open={openSections.storage}>
              <summary onClick={handleSummaryClick('storage')}>
                <span>ストレージ</span>
                <span className={`mcp-status ${storageInfo.persistent ? 'mcp-status-connected' : 'mcp-status-warning'}`}>
                  {storageInfo.persistent ? '永続化済み' : '未永続化'}
                </span>
              </summary>
              <div className="settings-section-content">
                <p className="mcp-hint">
                  {storageInfo.persistent
                    ? 'ストレージは永続化されています。ブラウザによる自動削除から保護されます。'
                    : 'ストレージは永続化されていません。長期間未使用の場合、ブラウザがデータを自動削除する可能性があります。'}
                </p>
                <div className="storage-usage">{formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)}</div>
                <div
                  className="storage-bar"
                  role={storageInfo.quota > 0 ? 'progressbar' : undefined}
                  aria-label="ストレージ使用量"
                  aria-valuenow={storageInfo.quota > 0 ? Math.min(storageInfo.usage, storageInfo.quota) : undefined}
                  aria-valuemin={storageInfo.quota > 0 ? 0 : undefined}
                  aria-valuemax={storageInfo.quota > 0 ? storageInfo.quota : undefined}
                  aria-valuetext={storageInfo.quota > 0 ? undefined : 'ストレージ使用量: 不明'}
                >
                  <div
                    className="storage-bar-fill"
                    style={{ width: `${storageInfo.quota > 0 ? Math.min((storageInfo.usage / storageInfo.quota) * 100, 100) : 0}%` }}
                  />
                </div>
                <div className="storage-portability">
                  <p className="mcp-hint">
                    設定・会話・記憶（アーカイブ含む）・添付を JSON でバックアップ/復元できます。
                  </p>
                  <div className="storage-portability-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={handleExportData}
                      disabled={portabilityStatus === 'exporting' || portabilityStatus === 'importing'}
                    >
                      {portabilityStatus === 'exporting' ? 'エクスポート中...' : 'データをエクスポート'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={handlePickImportFile}
                      disabled={portabilityStatus === 'exporting' || portabilityStatus === 'importing'}
                    >
                      {portabilityStatus === 'importing' ? 'インポート中...' : 'データをインポート'}
                    </button>
                    {needsReloadAfterImport && (
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => window.location.reload()}
                      >
                        再読み込みして反映
                      </button>
                    )}
                  </div>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept="application/json,.json"
                    aria-label="バックアップファイルを選択"
                    style={{ display: 'none' }}
                    onChange={handleImportFileChange}
                  />
                  {portabilityMessage && (
                    <p
                      className={`storage-portability-message ${
                        portabilityStatus === 'error'
                          ? 'error'
                          : portabilityStatus === 'success'
                            ? 'success'
                            : ''
                      }`}
                    >
                      {portabilityMessage}
                    </p>
                  )}
                </div>
                {!storageInfo.persistent && (
                  <>
                    <p className="storage-warning">PWA としてインストールすると永続化される可能性が高くなります。</p>
                    {isIOSSafari() && !isStandaloneMode() && (
                      <div className="ios-install-guide">
                        <span className="install-step-badge">
                          <span className="install-step-icon" aria-hidden="true">&#xFEFF;⬆&#xFE0E;</span> 共有ボタン
                        </span>
                        <span className="install-step-arrow" aria-hidden="true">→</span>
                        <span className="install-step-badge">ホーム画面に追加</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </details>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
