import { describe, it, expect } from 'vitest';
import { getDefaultHeartbeatConfig } from './config';
import {
  applyPersonaPresetToConfig,
  buildPersonaPreset,
  parsePersonaPresetFromJson,
  PERSONA_PRESET_MAX_FILE_SIZE,
  type PersonaPreset,
} from './personaPreset';
import type { AppConfig } from '../types';

function createConfig(): AppConfig {
  return {
    openaiApiKey: '',
    braveApiKey: '',
    openWeatherMapApiKey: '',
    mcpServers: [],
    heartbeat: {
      ...getDefaultHeartbeatConfig(),
      tasks: [
        { id: 'calendar-check', name: 'カレンダー', description: '', enabled: true, type: 'builtin' },
        { id: 'feed-check', name: 'フィード', description: '', enabled: false, type: 'builtin' },
        { id: 'custom-task', name: 'カスタム', description: '', enabled: true, type: 'custom' },
      ],
    },
    persona: {
      name: 'Preset Agent',
      personality: '要点重視',
      tone: '簡潔',
      customInstructions: '箇条書きで返答する',
    },
    suggestionFrequency: 'medium',
  };
}

describe('personaPreset', () => {
  it('現在設定からプリセットを生成できる', () => {
    const preset = buildPersonaPreset(createConfig());
    expect(preset).toEqual({
      format: 'iagent-persona-preset',
      version: 1,
      persona: {
        name: 'Preset Agent',
        personality: '要点重視',
        tone: '簡潔',
        customInstructions: '箇条書きで返答する',
      },
      suggestionFrequency: 'medium',
      recommendedTaskIds: ['calendar-check'],
    });
  });

  it('プリセット JSON をパースできる', () => {
    const json = JSON.stringify({
      format: 'iagent-persona-preset',
      version: 1,
      persona: {
        name: 'Reader',
        personality: '情報収集志向',
        tone: '端的',
        customInstructions: 'ニュースを優先',
      },
      suggestionFrequency: 'high',
      recommendedTaskIds: ['calendar-check', 'rss-digest-daily'],
    });
    const parsed = parsePersonaPresetFromJson(json);
    expect(parsed.persona.name).toBe('Reader');
    expect(parsed.suggestionFrequency).toBe('high');
    expect(parsed.recommendedTaskIds).toEqual(['calendar-check', 'rss-digest-daily']);
  });

  it('format が不正な JSON はエラーにする', () => {
    const json = JSON.stringify({
      format: 'wrong-format',
      version: 1,
      persona: { name: 'a', personality: '', tone: '', customInstructions: '' },
    });
    expect(() => parsePersonaPresetFromJson(json)).toThrow(/format が不正/);
  });

  it('suggestionFrequency が不正な JSON はエラーにする', () => {
    const json = JSON.stringify({
      format: 'iagent-persona-preset',
      version: 1,
      persona: { name: 'a', personality: '', tone: '', customInstructions: '' },
      suggestionFrequency: 'always',
    });
    expect(() => parsePersonaPresetFromJson(json)).toThrow(/suggestionFrequency/);
  });

  it('上限を超えるフィールドは最大長に切り詰める', () => {
    const longStr = 'a'.repeat(3000);
    const json = JSON.stringify({
      format: 'iagent-persona-preset',
      version: 1,
      persona: {
        name: longStr,
        personality: longStr,
        tone: longStr,
        customInstructions: longStr,
      },
    });
    const parsed = parsePersonaPresetFromJson(json);
    expect(parsed.persona.name.length).toBe(100);
    expect(parsed.persona.personality.length).toBe(500);
    expect(parsed.persona.tone.length).toBe(200);
    expect(parsed.persona.customInstructions.length).toBe(2000);
  });

  it('PERSONA_PRESET_MAX_FILE_SIZE が 100KB である', () => {
    expect(PERSONA_PRESET_MAX_FILE_SIZE).toBe(100 * 1024);
  });

  it('プリセットを適用すると persona と推奨タスクを更新できる', () => {
    const config = createConfig();
    const preset: PersonaPreset = {
      format: 'iagent-persona-preset',
      version: 1,
      persona: {
        name: 'Imported',
        personality: '分析重視',
        tone: 'フォーマル',
        customInstructions: '根拠付きで回答',
      },
      suggestionFrequency: 'high',
      recommendedTaskIds: ['feed-check'],
    };

    const next = applyPersonaPresetToConfig(config, preset);
    expect(next.persona).toEqual(preset.persona);
    expect(next.suggestionFrequency).toBe('high');
    expect(next.heartbeat?.tasks.find((task) => task.id === 'calendar-check')?.enabled).toBe(false);
    expect(next.heartbeat?.tasks.find((task) => task.id === 'feed-check')?.enabled).toBe(true);
    expect(next.heartbeat?.tasks.find((task) => task.id === 'custom-task')?.enabled).toBe(true);
    expect(config.heartbeat?.tasks.find((task) => task.id === 'calendar-check')?.enabled).toBe(true);
  });
});

