import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendOpsEvent } from '../store/heartbeatStore';
import { createSetupWizardSessionId, recordSetupWizardOpsEvent } from './setupWizardOps';

vi.mock('../store/heartbeatStore', () => ({
  appendOpsEvent: vi.fn(),
}));

describe('setupWizardOps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createSetupWizardSessionId は prefix + timestamp を含む', () => {
    const id = createSetupWizardSessionId(1700000000000);
    expect(id).toMatch(/^wizard-1700000000000-[a-z0-9]+$/i);
  });

  it('recordSetupWizardOpsEvent は setup-wizard ops-event を保存する', async () => {
    await recordSetupWizardOpsEvent({
      sessionId: 'wizard-1',
      action: 'completed',
      step: 3,
      presetLabel: '情報収集型',
      presetRecommended: true,
      suggestionFrequency: 'high',
      enabledTaskCount: 4,
    }, 1700000001000);

    expect(appendOpsEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'setup-wizard',
      timestamp: 1700000001000,
      source: 'tab',
      wizardSessionId: 'wizard-1',
      wizardAction: 'completed',
      wizardStep: 3,
      wizardPresetLabel: '情報収集型',
      wizardPresetRecommended: true,
      wizardSuggestionFrequency: 'high',
      wizardEnabledTaskCount: 4,
    }));
  });

  it('保存失敗時も throw せず警告にフォールバックする', async () => {
    vi.mocked(appendOpsEvent).mockRejectedValueOnce(new Error('failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(recordSetupWizardOpsEvent({
      sessionId: 'wizard-1',
      action: 'start',
      step: 0,
    })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('[setupWizardOps] failed to append setup-wizard ops-event', expect.any(Error));
  });
});
