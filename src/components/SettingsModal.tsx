import { useState, useEffect, useCallback } from 'react';
import { getConfig, saveConfig } from '../core/config';
import { mcpManager, type MCPConnectionStatus } from '../core/mcpManager';
import type { AppConfig, MCPServerConfig } from '../types';

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

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
