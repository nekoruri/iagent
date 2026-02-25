import { useState, useEffect, useCallback } from 'react';
import { getConfig, saveConfig, getDefaultHeartbeatConfig, getDefaultOtelConfig, getDefaultProxyConfig, BUILTIN_HEARTBEAT_TASKS } from '../core/config';
import { mcpManager, type MCPConnectionStatus } from '../core/mcpManager';
import { getNotificationPermission, requestNotificationPermission } from '../core/notifier';
import { subscribePush, unsubscribePush, getPushSubscription, registerPeriodicSync, unregisterPeriodicSync } from '../core/pushSubscription';
import { registerProxyToken } from '../core/corsProxy';
import { getUrlValidationError } from '../core/urlValidation';
import { isReadOnlyTool } from '../core/agent';
import type { AppConfig, MCPServerConfig, HeartbeatConfig, HeartbeatTask, TaskSchedule, OtelConfig, PushConfig, ProxyConfig } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
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

export function SettingsModal({ open, onClose }: Props) {
  const [config, setConfig] = useState<AppConfig>(getConfig);
  const [, setTick] = useState(0);

  // MCPManager の状態変更をリッスン
  useEffect(() => {
    if (!open) return;
    return mcpManager.subscribe(() => setTick((t) => t + 1));
  }, [open]);

  // モーダルが開かれた時に最新の設定を読み込む
  useEffect(() => {
    if (open) setConfig(getConfig());
  }, [open]);

  const heartbeat = config.heartbeat ?? getDefaultHeartbeatConfig();
  const push: PushConfig = config.push ?? { enabled: false, serverUrl: '' };
  const proxy: ProxyConfig = config.proxy ?? getDefaultProxyConfig();
  const otel = config.otel ?? getDefaultOtelConfig();
  const [otelHeadersText, setOtelHeadersText] = useState(JSON.stringify(otel.headers));
  const [pushStatus, setPushStatus] = useState<'idle' | 'subscribing' | 'unsubscribing' | 'error'>('idle');
  const [pushError, setPushError] = useState<string>('');
  const [hasPushSubscription, setHasPushSubscription] = useState(false);
  const [proxyMasterKey, setProxyMasterKey] = useState('');
  const [proxyStatus, setProxyStatus] = useState<'idle' | 'registering' | 'error'>('idle');
  const [proxyError, setProxyError] = useState<string>('');
  const [proxyDomainsText, setProxyDomainsText] = useState(proxy.allowedDomains.join(', '));
  const [mcpToolsList, setMcpToolsList] = useState<Array<{ serverName: string; toolName: string }>>([]);

  // モーダルが開かれたとき、ヘッダーテキストも同期
  useEffect(() => {
    if (open) setOtelHeadersText(JSON.stringify(config.otel?.headers ?? {}));
  }, [open, config.otel?.headers]);

  // モーダルが開かれたとき、プロキシ関連の状態をリセット
  useEffect(() => {
    if (open) {
      setProxyDomainsText(config.proxy?.allowedDomains?.join(', ') ?? '');
      setProxyMasterKey('');
      setProxyError('');
      setProxyStatus('idle');
    }
  }, [open, config.proxy?.allowedDomains]);

  // Push Subscription 状態を初期化
  useEffect(() => {
    if (!open) return;
    setPushError('');
    getPushSubscription().then((sub) => setHasPushSubscription(!!sub));
  }, [open]);

  // MCP ツール一覧を取得
  useEffect(() => {
    if (!open) return;
    mcpManager.getAvailableTools().then(setMcpToolsList).catch(() => setMcpToolsList([]));
  }, [open]);

  const updateProxy = (patch: Partial<ProxyConfig>) => {
    setConfig((prev) => ({
      ...prev,
      proxy: { ...proxy, ...patch },
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>設定</h2>

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

        <div className="mcp-section">
          <div className="mcp-header">
            <h3>MCP Servers</h3>
            <button className="btn-secondary btn-small" onClick={addMCPServer}>+ 追加</button>
          </div>
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
                    onChange={(e) => updateMCPServer(server.id, { name: e.target.value })}
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

        {/* Heartbeat 設定 */}
        <div className="mcp-section">
          <div className="mcp-header">
            <h3>Heartbeat</h3>
            <label className="hb-toggle-label">
              <input
                type="checkbox"
                checked={heartbeat.enabled}
                onChange={(e) => updateHeartbeat({ enabled: e.target.checked })}
              />
              有効
            </label>
          </div>
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
                          {readOnlyTools.map((t) => (
                            <label key={`${t.serverName}/${t.toolName}`} className="mcp-toggle-label hb-mcp-tool-label">
                              <input
                                type="checkbox"
                                checked={allowedTools.includes(t.toolName)}
                                onChange={(e) => {
                                  const newAllowed = e.target.checked
                                    ? [...allowedTools, t.toolName]
                                    : allowedTools.filter((n) => n !== t.toolName);
                                  updateHeartbeatTask(task.id, { allowedMcpTools: newAllowed });
                                }}
                              />
                              <span className="hb-mcp-tool-name">{t.toolName}</span>
                              <span className="hb-mcp-tool-server">({t.serverName})</span>
                            </label>
                          ))}
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

        {/* CORS プロキシ設定 */}
        <div className="mcp-section">
          <div className="mcp-header">
            <h3>CORS プロキシ</h3>
            <label className="hb-toggle-label">
              <input
                type="checkbox"
                checked={proxy.enabled}
                onChange={(e) => updateProxy({ enabled: e.target.checked })}
              />
              有効
            </label>
          </div>
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

        {/* オブザーバビリティ設定 */}
        <div className="mcp-section">
          <div className="mcp-header">
            <h3>オブザーバビリティ</h3>
            <label className="hb-toggle-label">
              <input
                type="checkbox"
                checked={otel.enabled}
                onChange={(e) => updateOtel({ enabled: e.target.checked })}
              />
              有効
            </label>
          </div>
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

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
