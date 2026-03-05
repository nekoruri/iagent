import { getDefaultPersonaConfig } from './config';
import type { AppConfig, PersonaConfig, SuggestionFrequency } from '../types';

const PERSONA_PRESET_FORMAT = 'iagent-persona-preset' as const;
const PERSONA_PRESET_VERSION = 1 as const;
const VALID_SUGGESTION_FREQUENCIES: SuggestionFrequency[] = ['high', 'medium', 'low'];

/** プリセットファイルの最大サイズ（バイト） */
export const PERSONA_PRESET_MAX_FILE_SIZE = 100 * 1024; // 100KB

/** persona フィールドの最大文字数 */
const PERSONA_FIELD_MAX_LENGTH = {
  name: 100,
  personality: 500,
  tone: 200,
  customInstructions: 2000,
} as const;

export interface PersonaPreset {
  format: typeof PERSONA_PRESET_FORMAT;
  version: typeof PERSONA_PRESET_VERSION;
  persona: PersonaConfig;
  suggestionFrequency?: SuggestionFrequency;
  recommendedTaskIds?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePersonaConfig(raw: unknown): PersonaConfig {
  if (!isRecord(raw)) {
    throw new Error('persona はオブジェクトである必要があります。');
  }

  const base = getDefaultPersonaConfig();
  const name = typeof raw.name === 'string' ? raw.name.slice(0, PERSONA_FIELD_MAX_LENGTH.name) : base.name;
  const personality = typeof raw.personality === 'string' ? raw.personality.slice(0, PERSONA_FIELD_MAX_LENGTH.personality) : base.personality;
  const tone = typeof raw.tone === 'string' ? raw.tone.slice(0, PERSONA_FIELD_MAX_LENGTH.tone) : base.tone;
  const customInstructions = typeof raw.customInstructions === 'string'
    ? raw.customInstructions.slice(0, PERSONA_FIELD_MAX_LENGTH.customInstructions)
    : base.customInstructions;

  return {
    name,
    personality,
    tone,
    customInstructions,
  };
}

function parseSuggestionFrequency(raw: unknown): SuggestionFrequency | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !VALID_SUGGESTION_FREQUENCIES.includes(raw as SuggestionFrequency)) {
    throw new Error('suggestionFrequency は high/medium/low のいずれかを指定してください。');
  }
  return raw as SuggestionFrequency;
}

function parseRecommendedTaskIds(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error('recommendedTaskIds は文字列配列である必要があります。');
  }

  const normalized = raw
    .map((value) => {
      if (typeof value !== 'string') {
        throw new Error('recommendedTaskIds には文字列のみ指定できます。');
      }
      return value.trim();
    })
    .filter((value) => value.length > 0);

  return [...new Set(normalized)];
}

export function buildPersonaPreset(config: AppConfig): PersonaPreset {
  const persona = {
    ...getDefaultPersonaConfig(),
    ...(config.persona ?? {}),
  };

  const enabledBuiltinTaskIds = (config.heartbeat?.tasks ?? [])
    .filter((task) => task.type === 'builtin' && task.enabled)
    .map((task) => task.id);

  return {
    format: PERSONA_PRESET_FORMAT,
    version: PERSONA_PRESET_VERSION,
    persona,
    ...(config.suggestionFrequency ? { suggestionFrequency: config.suggestionFrequency } : {}),
    ...(enabledBuiltinTaskIds.length > 0 ? { recommendedTaskIds: enabledBuiltinTaskIds } : {}),
  };
}

export function parsePersonaPresetFromJson(json: string): PersonaPreset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('JSON の解析に失敗しました。');
  }

  if (!isRecord(parsed)) {
    throw new Error('プリセット JSON はオブジェクトである必要があります。');
  }

  if (parsed.format !== PERSONA_PRESET_FORMAT) {
    throw new Error(`format が不正です。${PERSONA_PRESET_FORMAT} を指定してください。`);
  }

  if (parsed.version !== PERSONA_PRESET_VERSION) {
    throw new Error(`version が不正です。${PERSONA_PRESET_VERSION} を指定してください。`);
  }

  const suggestionFrequency = parseSuggestionFrequency(parsed.suggestionFrequency);
  const recommendedTaskIds = parseRecommendedTaskIds(parsed.recommendedTaskIds);

  return {
    format: PERSONA_PRESET_FORMAT,
    version: PERSONA_PRESET_VERSION,
    persona: parsePersonaConfig(parsed.persona),
    ...(suggestionFrequency ? { suggestionFrequency } : {}),
    ...(recommendedTaskIds ? { recommendedTaskIds } : {}),
  };
}

export function applyPersonaPresetToConfig(config: AppConfig, preset: PersonaPreset): AppConfig {
  const recommendedTaskIds = preset.recommendedTaskIds
    ? new Set(preset.recommendedTaskIds)
    : undefined;

  return {
    ...config,
    persona: { ...preset.persona },
    ...(preset.suggestionFrequency ? { suggestionFrequency: preset.suggestionFrequency } : {}),
    ...(config.heartbeat
      ? {
          heartbeat: {
            ...config.heartbeat,
            tasks: config.heartbeat.tasks.map((task) => {
              if (task.type !== 'builtin' || !recommendedTaskIds) return task;
              return {
                ...task,
                enabled: recommendedTaskIds.has(task.id),
              };
            }),
          },
        }
      : {}),
  };
}
