import { useState } from 'react';
import { getConfig, saveConfig } from '../core/config';
import type { AppConfig } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const [config, setConfig] = useState<AppConfig>(getConfig);

  if (!open) return null;

  const handleSave = () => {
    saveConfig(config);
    onClose();
  };

  const update = (key: keyof AppConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

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

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
