import { useState } from 'react';
import { getConfig, saveConfig, getDefaultHeartbeatConfig, getDefaultPersonaConfig } from '../core/config';
import type { AppConfig, PersonaConfig, HeartbeatConfig } from '../types';

interface Props {
  onComplete: () => void;
}

const PERSONA_PRESETS: { label: string; personality: string; tone: string }[] = [
  { label: '丁寧アシスタント', personality: '丁寧で親しみやすく、ユーザーの意図を正確に汲み取る', tone: '敬語で穏やかに' },
  { label: 'フレンドリー', personality: '明るくカジュアルで、友達のように接する', tone: 'タメ口でフランクに' },
  { label: 'プロフェッショナル', personality: '簡潔で的確、専門的な知識を持つ', tone: 'ビジネスライクに端的に' },
];

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<AppConfig>(getConfig);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);

  const persona: PersonaConfig = config.persona ?? getDefaultPersonaConfig();
  const heartbeat: HeartbeatConfig = config.heartbeat ?? getDefaultHeartbeatConfig();

  const update = (key: keyof AppConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updatePersona = (patch: Partial<PersonaConfig>) => {
    setConfig((prev) => ({
      ...prev,
      persona: { ...(prev.persona ?? getDefaultPersonaConfig()), ...patch },
    }));
  };

  const updateHeartbeat = (patch: Partial<HeartbeatConfig>) => {
    setConfig((prev) => ({
      ...prev,
      heartbeat: { ...(prev.heartbeat ?? getDefaultHeartbeatConfig()), ...patch },
    }));
  };

  const canProceed = (): boolean => {
    if (step === 1) return config.openaiApiKey.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = () => {
    setStep(3);
  };

  const handleComplete = () => {
    saveConfig(config);
    onComplete();
  };

  const selectPreset = (index: number) => {
    if (selectedPreset === index) {
      setSelectedPreset(null);
      updatePersona({ personality: '', tone: '' });
    } else {
      setSelectedPreset(index);
      const preset = PERSONA_PRESETS[index];
      updatePersona({ personality: preset.personality, tone: preset.tone });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal wizard-modal" onClick={(e) => e.stopPropagation()}>
        {/* ステップインジケータ */}
        <div className="wizard-steps">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`wizard-step-dot${i === step ? ' active' : ''}${i < step ? ' completed' : ''}`}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="wizard-content">
            <h2>iAgent へようこそ</h2>
            <p className="wizard-description">
              iAgent は、ブラウザ上で動作する自律型 AI アシスタントです。
              カレンダーの確認、天気のチェック、Web 検索など、日常のタスクをバックグラウンドで自動的にサポートします。
            </p>
            <p className="wizard-description">
              まずは簡単な初期設定を行いましょう。
            </p>
          </div>
        )}

        {/* Step 1: API Key */}
        {step === 1 && (
          <div className="wizard-content">
            <h2>API キーの設定</h2>
            <label>
              OpenAI API Key <span className="required">*必須</span>
              <input
                type="password"
                value={config.openaiApiKey}
                onChange={(e) => update('openaiApiKey', e.target.value)}
                placeholder="sk-..."
              />
            </label>
            <details className="wizard-optional">
              <summary>追加の API キー（オプション）</summary>
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
            </details>
          </div>
        )}

        {/* Step 2: Persona */}
        {step === 2 && (
          <div className="wizard-content">
            <h2>エージェントの設定</h2>
            <label>
              エージェント名
              <input
                type="text"
                value={persona.name}
                onChange={(e) => updatePersona({ name: e.target.value })}
                placeholder="iAgent"
              />
            </label>
            <div className="wizard-preset-group">
              <span className="wizard-preset-label">性格プリセット</span>
              <div className="wizard-presets">
                {PERSONA_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`wizard-preset-btn${selectedPreset === i ? ' active' : ''}`}
                    onClick={() => selectPreset(i)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <label>
              性格・特徴
              <input
                type="text"
                value={persona.personality}
                onChange={(e) => {
                  setSelectedPreset(null);
                  updatePersona({ personality: e.target.value });
                }}
                placeholder="例: 丁寧で親しみやすい"
              />
            </label>
            <label>
              話し方
              <input
                type="text"
                value={persona.tone}
                onChange={(e) => {
                  setSelectedPreset(null);
                  updatePersona({ tone: e.target.value });
                }}
                placeholder="例: カジュアル"
              />
            </label>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 3 && (
          <div className="wizard-content">
            <h2>設定完了！</h2>
            <div className="wizard-heartbeat-intro">
              <strong>Heartbeat 機能</strong>
              <p>
                バックグラウンドで定期的にカレンダーや天気をチェックし、変化があれば自動で通知します。
              </p>
              <label className="wizard-heartbeat-toggle">
                <input
                  type="checkbox"
                  checked={heartbeat.enabled}
                  onChange={(e) => updateHeartbeat({ enabled: e.target.checked })}
                />
                Heartbeat を有効にする
              </label>
            </div>
            <p className="wizard-hint">
              右上の ⚙ からいつでも設定を変更できます。
            </p>
          </div>
        )}

        {/* ナビゲーション */}
        <div className="wizard-nav">
          {step > 0 && step < 3 && (
            <button className="btn-secondary" onClick={handleBack}>戻る</button>
          )}
          <div className="wizard-nav-spacer" />
          {step === 0 && (
            <button className="btn-primary" onClick={handleNext}>はじめる</button>
          )}
          {step === 1 && (
            <button className="btn-primary" onClick={handleNext} disabled={!canProceed()}>次へ</button>
          )}
          {step === 2 && (
            <>
              <button className="btn-secondary" onClick={handleSkip}>スキップ</button>
              <button className="btn-primary" onClick={handleNext}>次へ</button>
            </>
          )}
          {step === 3 && (
            <button className="btn-primary" onClick={handleComplete}>使い始める</button>
          )}
        </div>
      </div>
    </div>
  );
}
