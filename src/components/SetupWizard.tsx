import { useState } from 'react';
import { getConfig, saveConfig, getDefaultHeartbeatConfig, getDefaultPersonaConfig } from '../core/config';
import type { AppConfig, PersonaConfig, HeartbeatConfig, SuggestionFrequency } from '../types';

interface Props {
  onComplete: () => void | Promise<void>;
}

interface PersonaPreset {
  label: string;
  description: string;
  personality: string;
  tone: string;
  suggestionFrequency: SuggestionFrequency;
  recommendedTaskIds: string[];
}

const PERSONA_PRESETS: PersonaPreset[] = [
  {
    label: '情報収集型',
    description: 'フィード/監視の変化を素早く要約し、重要度付きで報告します。',
    personality: '情報の変化に敏感で、重要度順に要点を整理して伝える。',
    tone: '結論先行で簡潔に。',
    suggestionFrequency: 'high',
    recommendedTaskIds: ['calendar-check', 'feed-check', 'web-monitor-check', 'briefing-morning'],
  },
  {
    label: 'PM型',
    description: '期限・会議・進捗の見落としを減らし、意思決定を支援します。',
    personality: '進行管理と優先順位付けを重視し、期限/依存関係を意識して提案する。',
    tone: '実務的かつ端的に。',
    suggestionFrequency: 'medium',
    recommendedTaskIds: ['calendar-check', 'briefing-morning', 'weekly-summary', 'monthly-review'],
  },
  {
    label: '学習者型',
    description: '学習の継続を支援し、復習ポイントと次の一歩を提案します。',
    personality: '段階的な理解を重視し、学習内容を小さな行動に分解して支援する。',
    tone: 'やさしく具体的に。',
    suggestionFrequency: 'medium',
    recommendedTaskIds: ['calendar-check', 'briefing-morning', 'reflection', 'pattern-recognition'],
  },
];

const RECOMMENDED_PRESET_INDEX = 0;

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

  const handleComplete = async () => {
    saveConfig(config);
    await onComplete();
  };

  const applyPreset = (index: number) => {
    const preset = PERSONA_PRESETS[index];
    setSelectedPreset(index);
    setConfig((prev) => {
      const currentHeartbeat = prev.heartbeat ?? getDefaultHeartbeatConfig();
      return {
        ...prev,
        persona: {
          ...(prev.persona ?? getDefaultPersonaConfig()),
          personality: preset.personality,
          tone: preset.tone,
        },
        suggestionFrequency: preset.suggestionFrequency,
        heartbeat: {
          ...currentHeartbeat,
          tasks: currentHeartbeat.tasks.map((task) => {
            if (task.type !== 'builtin') return task;
            return {
              ...task,
              enabled: preset.recommendedTaskIds.includes(task.id),
            };
          }),
        },
      };
    });
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
              <div className="wizard-preset-header">
                <span className="wizard-preset-label">利用目的プリセット</span>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => applyPreset(RECOMMENDED_PRESET_INDEX)}
                >
                  推奨プリセットを適用
                </button>
              </div>
              <p className="wizard-preset-hint">
                迷ったら「{PERSONA_PRESETS[RECOMMENDED_PRESET_INDEX].label}」を選択してください（1クリックで推奨値を適用）。
              </p>
              <div className="wizard-presets">
                {PERSONA_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`wizard-preset-btn${selectedPreset === i ? ' active' : ''}`}
                    onClick={() => applyPreset(i)}
                  >
                    {preset.label}
                    {i === RECOMMENDED_PRESET_INDEX && <span className="wizard-preset-badge">推奨</span>}
                  </button>
                ))}
              </div>
              {selectedPreset !== null && (
                <p className="wizard-preset-description">
                  {PERSONA_PRESETS[selectedPreset].description}
                </p>
              )}
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
