import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupWizard } from './SetupWizard';

// config モック
vi.mock('../core/config', () => ({
  getConfig: vi.fn(() => ({
    openaiApiKey: '',
    braveApiKey: '',
    openWeatherMapApiKey: '',
    mcpServers: [],
    heartbeat: {
      enabled: false,
      intervalMinutes: 30,
      quietHoursStart: 0,
      quietHoursEnd: 6,
      tasks: [],
      desktopNotification: false,
    },
    otel: {
      enabled: false,
      endpoint: '/api/otel',
      headers: {},
      batchSize: 10,
      flushIntervalMs: 30000,
    },
    persona: {
      name: 'iAgent',
      personality: '',
      tone: '',
      customInstructions: '',
    },
    theme: 'system',
  })),
  saveConfig: vi.fn(),
  getDefaultHeartbeatConfig: vi.fn(() => ({
    enabled: false,
    intervalMinutes: 30,
    quietHoursStart: 0,
    quietHoursEnd: 6,
    tasks: [],
    desktopNotification: false,
  })),
  getDefaultPersonaConfig: vi.fn(() => ({
    name: 'iAgent',
    personality: '',
    tone: '',
    customInstructions: '',
  })),
}));

describe('SetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('初期表示で Welcome ステップが表示される', () => {
    render(<SetupWizard onComplete={vi.fn()} />);
    expect(screen.getByText('iAgent へようこそ')).toBeInTheDocument();
    expect(screen.getByText('はじめる')).toBeInTheDocument();
  });

  it('「はじめる」で API Key ステップに遷移', async () => {
    render(<SetupWizard onComplete={vi.fn()} />);

    await userEvent.click(screen.getByText('はじめる'));

    expect(screen.getByText('API キーの設定')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
  });

  it('API Key 未入力では「次へ」が disabled', async () => {
    render(<SetupWizard onComplete={vi.fn()} />);

    await userEvent.click(screen.getByText('はじめる'));

    const nextBtn = screen.getByText('次へ');
    expect(nextBtn).toBeDisabled();
  });

  it('API Key 入力後「次へ」で Persona ステップに遷移', async () => {
    render(<SetupWizard onComplete={vi.fn()} />);

    await userEvent.click(screen.getByText('はじめる'));

    const apiKeyInput = screen.getByPlaceholderText('sk-...');
    await userEvent.type(apiKeyInput, 'sk-test-key');

    const nextBtn = screen.getByText('次へ');
    expect(nextBtn).not.toBeDisabled();

    await userEvent.click(nextBtn);

    expect(screen.getByText('エージェントの設定')).toBeInTheDocument();
  });

  it('Persona「スキップ」で Complete に飛ぶ', async () => {
    render(<SetupWizard onComplete={vi.fn()} />);

    await userEvent.click(screen.getByText('はじめる'));
    await userEvent.type(screen.getByPlaceholderText('sk-...'), 'sk-test');
    await userEvent.click(screen.getByText('次へ'));

    await userEvent.click(screen.getByText('スキップ'));

    expect(screen.getByText('設定完了！')).toBeInTheDocument();
  });

  it('プリセット選択で personality/tone が反映される', async () => {
    render(<SetupWizard onComplete={vi.fn()} />);

    await userEvent.click(screen.getByText('はじめる'));
    await userEvent.type(screen.getByPlaceholderText('sk-...'), 'sk-test');
    await userEvent.click(screen.getByText('次へ'));

    // プリセット選択
    await userEvent.click(screen.getByText('フレンドリー'));

    const personalityInput = screen.getByPlaceholderText('例: 丁寧で親しみやすい') as HTMLInputElement;
    const toneInput = screen.getByPlaceholderText('例: カジュアル') as HTMLInputElement;

    expect(personalityInput.value).toBe('明るくカジュアルで、友達のように接する');
    expect(toneInput.value).toBe('タメ口でフランクに');
  });

  it('「戻る」で前のステップに戻れる', async () => {
    render(<SetupWizard onComplete={vi.fn()} />);

    await userEvent.click(screen.getByText('はじめる'));
    await userEvent.type(screen.getByPlaceholderText('sk-...'), 'sk-test');
    await userEvent.click(screen.getByText('次へ'));

    expect(screen.getByText('エージェントの設定')).toBeInTheDocument();

    await userEvent.click(screen.getByText('戻る'));

    expect(screen.getByText('API キーの設定')).toBeInTheDocument();
  });

  it('Complete で Heartbeat toggle が動作する', async () => {
    render(<SetupWizard onComplete={vi.fn()} />);

    await userEvent.click(screen.getByText('はじめる'));
    await userEvent.type(screen.getByPlaceholderText('sk-...'), 'sk-test');
    await userEvent.click(screen.getByText('次へ'));
    await userEvent.click(screen.getByText('スキップ'));

    const checkbox = screen.getByLabelText('Heartbeat を有効にする') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    await userEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('「使い始める」で saveConfig と onComplete が呼ばれる', async () => {
    const { saveConfig } = await import('../core/config');
    const onComplete = vi.fn();
    render(<SetupWizard onComplete={onComplete} />);

    await userEvent.click(screen.getByText('はじめる'));
    await userEvent.type(screen.getByPlaceholderText('sk-...'), 'sk-test');
    await userEvent.click(screen.getByText('次へ'));
    await userEvent.click(screen.getByText('スキップ'));

    await userEvent.click(screen.getByText('使い始める'));

    expect(saveConfig).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it('ステップインジケータの active/completed 状態', async () => {
    const { container } = render(<SetupWizard onComplete={vi.fn()} />);

    // Step 0: 最初のドットが active
    const dots = container.querySelectorAll('.wizard-step-dot');
    expect(dots[0]).toHaveClass('active');
    expect(dots[1]).not.toHaveClass('active');

    // Step 1 に進む
    await userEvent.click(screen.getByText('はじめる'));

    const dotsAfter = container.querySelectorAll('.wizard-step-dot');
    expect(dotsAfter[0]).toHaveClass('completed');
    expect(dotsAfter[1]).toHaveClass('active');
  });
});
