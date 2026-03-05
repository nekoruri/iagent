import type { SuggestionFrequency } from '../types';
import { appendOpsEvent } from '../store/heartbeatStore';

export type SetupWizardOpsAction =
  | 'start'
  | 'step-next'
  | 'step-back'
  | 'step-skip'
  | 'preset-applied'
  | 'completed';

export interface SetupWizardOpsEventInput {
  sessionId: string;
  action: SetupWizardOpsAction;
  step: number;
  nextStep?: number;
  presetLabel?: string;
  presetRecommended?: boolean;
  suggestionFrequency?: SuggestionFrequency;
  enabledTaskCount?: number;
}

function randomSuffix(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export function createSetupWizardSessionId(nowTs = Date.now()): string {
  return `wizard-${nowTs}-${randomSuffix()}`;
}

export async function recordSetupWizardOpsEvent(input: SetupWizardOpsEventInput, nowTs = Date.now()): Promise<void> {
  try {
    await appendOpsEvent({
      type: 'setup-wizard',
      timestamp: nowTs,
      source: 'tab',
      wizardSessionId: input.sessionId,
      wizardAction: input.action,
      wizardStep: input.step,
      ...(Number.isFinite(input.nextStep) ? { wizardNextStep: input.nextStep } : {}),
      ...(input.presetLabel ? { wizardPresetLabel: input.presetLabel } : {}),
      ...(typeof input.presetRecommended === 'boolean' ? { wizardPresetRecommended: input.presetRecommended } : {}),
      ...(input.suggestionFrequency ? { wizardSuggestionFrequency: input.suggestionFrequency } : {}),
      ...(Number.isFinite(input.enabledTaskCount) ? { wizardEnabledTaskCount: input.enabledTaskCount } : {}),
    });
  } catch (error) {
    console.warn('[setupWizardOps] failed to append setup-wizard ops-event', error);
  }
}
