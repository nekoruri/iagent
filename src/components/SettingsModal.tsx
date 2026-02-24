import { useState, useEffect, useCallback } from 'react';
import { getConfig, saveConfig, getDefaultHeartbeatConfig, getDefaultOtelConfig, BUILTIN_HEARTBEAT_TASKS } from '../core/config';
import { mcpManager, type MCPConnectionStatus } from '../core/mcpManager';
import { getNotificationPermission, requestNotificationPermission } from '../core/notifier';
import type { AppConfig, MCPServerConfig, HeartbeatConfig, HeartbeatTask, TaskSchedule, OtelConfig } from '../types';

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
  const otel = config.otel ?? getDefaultOtelConfig();
  const [otelHeadersText, setOtelHeadersText] = useState(JSON.stringify(otel.headers));

  // モーダルが開かれたとき、ヘッダーテキストも同期
  useEffect(() => {
    if (open) setOtelHeadersText(JSON.stringify(config.otel?.headers ?? {}));
  }, [open, config.otel?.headers]);

  const updateOtel = (patch: Partial<OtelConfig>) => {
    setConfig((prev) => ({
      ...prev,
      otel: { ...otel, ...patch },
    }));
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
              min={10}
              max={120}
              step={5}
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
