import { useState, useEffect, useCallback } from 'react';
import { getConfig, saveConfig, getDefaultHeartbeatConfig, getDefaultOtelConfig, getDefaultProxyConfig, getDefaultPersonaConfig, BUILTIN_HEARTBEAT_TASKS } from '../core/config';
import { mcpManager, type MCPConnectionStatus } from '../core/mcpManager';
import { getNotificationPermission, requestNotificationPermission } from '../core/notifier';
import { subscribePush, unsubscribePush, getPushSubscription, registerPeriodicSync, unregisterPeriodicSync } from '../core/pushSubscription';
import { registerProxyToken } from '../core/corsProxy';
import { getUrlValidationError } from '../core/urlValidation';
import { isReadOnlyTool } from '../core/toolUtils';
import { isIOSSafari, isStandaloneMode } from '../core/installDetect';
import { applyTheme } from '../core/theme';
import type { AppConfig, MCPServerConfig, HeartbeatConfig, HeartbeatTask, TaskSchedule, OtelConfig, PushConfig, ProxyConfig, PersonaConfig, ThemeMode, SuggestionFrequency } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

type SectionId = 'basic' | 'agent' | 'mcp' | 'heartbeat' | 'proxy' | 'otel' | 'storage';

const ALL_SECTIONS: SectionId[] = ['basic', 'agent', 'mcp', 'heartbeat', 'proxy', 'otel', 'storage'];

function initOpenSections(): Record<SectionId, boolean> {
  return Object.fromEntries(ALL_SECTIONS.map((id) => [id, true])) as Record<SectionId, boolean>;
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

  // MCPManager の状態変更をリッスン
  useEffect(() => {
    if (!open) return;
    return mcpManager.subscribe(() => setTick((t) => t + 1));
  }, [open]);

  const persona: PersonaConfig = config.persona ?? getDefaultPersonaConfig();
  const heartbeat = config.heartbeat ?? getDefaultHeartbeatConfig();
  const push: PushConfig = config.push ?? { enabled: false, serverUrl: '' };
  const proxy: ProxyConfig = config.proxy ?? getDefaultProxyConfig();
  const otel = config.otel ?? getDefaultOtelConfig();

  // Push Subscription 状態を初期化
  useEffect(() => {
    if (!open) return;
    getPushSubscription().then((sub) => setHasPushSubscription(!!sub));
  }, [open]);

  // MCP ツール一覧を取得
  useEffect(() => {
    if (!open) return;
    mcpManager.getAvailableTools().then(setMcpToolsList).catch(() => setMcpToolsList([]));
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

  const handleSave = useCallback(async () => {
    // 有効な MCP サーバーの URL をバリデーション
    const invalidServer = config.mcpServers.find(
      (s) => s.enabled && s.url && getUrlValidationError(s.url)
    );
    if (invalidServer) {
      return; // URL バリデーションエラーがある場合は保存しない
    }
    saveConfig(config);
    await mcpManager.syncWithConfig(config.mcpServers);
    onClose();
  }, [config, onClose]);

  const update = (key: keyof AppConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
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

  if (!open) return null;

  const builtinTasks = heartbeat.tasks.filter((t) => t.type === 'builtin');
  const customTasks = heartbeat.tasks.filter((t) => t.type === 'custom');

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
                  value={config.openaiApiKey}
                  onChange={(e) => update('openaiApiKey', e.target.value)}
                  placeholder="sk-..."
                />
              </label>

              <label>
                Brave Search API Key
                <input
                  type="password"
                  value={config.braveApiKey}
                  onChange={(e) => update('braveApiKey', e.target.value)}
                  placeholder="BSA..."
                />
              </label>

              <label>
                OpenWeatherMap API Key
                <input
                  type="password"
                  value={config.openWeatherMapApiKey}
                  onChange={(e) => update('openWeatherMapApiKey', e.target.value)}
                  placeholder="..."
                />
              </label>
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

              {(() => {
                const permission = getNotificationPermission();
                return (
                  <div className="hb-notification-row">
                    <label className="mcp-toggle-label">
                      <input
                        type="checkbox"
                        checked={heartbeat.desktopNotification}
                        disabled={permission === 'denied' || permission === 'unsupported'}
                        onChange={async (e) => {
                          if (e.target.checked) {
                            const result = await requestNotificationPermission();
                            if (result === 'granted') {
                              updateHeartbeat({ desktopNotification: true });
                            }
                          } else {
                            updateHeartbeat({ desktopNotification: false });
                          }
                        }}
                      />
                      デスクトップ通知
                    </label>
                    {permission === 'denied' && (
                      <p className="hb-notification-denied">通知がブロックされています。ブラウザの設定から許可してください。</p>
                    )}
                    {permission === 'unsupported' && (
                      <p className="hb-notification-denied">このブラウザは通知をサポートしていません。</p>
                    )}
                  </div>
                );
              })()}

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

              {/* Push 通知設定（Layer 3） */}
              <div className="hb-push-section">
                <h4>バックグラウンド Push（タブ閉鎖後も動作）</h4>
                <p className="mcp-hint">
                  外部サーバーからの wake-up シグナルで、タブを閉じた後も定期チェックを継続します。
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
                      disabled={pushStatus === 'subscribing' || pushStatus === 'unsubscribing'}
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
                  const updateSchedule = (patch: Partial<TaskSchedule>) => {
                    const current = task.schedule ?? { type: 'global' as const };
                    updateHeartbeatTask(task.id, { schedule: { ...current, ...patch } });
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

          {/* セクション 5: CORS プロキシ */}
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

          {/* セクション 6: オブザーバビリティ */}
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

          {/* セクション 7: ストレージ */}
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
