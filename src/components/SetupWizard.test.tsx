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
      tasks: [
        { id: 'calendar-check', name: 'カレンダー', description: '', enabled: true, type: 'builtin' },
        { id: 'feed-check', name: 'フィード', description: '', enabled: false, type: 'builtin' },
        { id: 'web-monitor-check', name: '監視', description: '', enabled: false, type: 'builtin' },
        { id: 'briefing-morning', name: '朝ブリ', description: '', enabled: false, type: 'builtin' },
        { id: 'weekly-summary', name: '週次', description: '', enabled: false, type: 'builtin' },
      ],
      desktopNotification: false,
      quietDays: [],
      maxNotificationsPerDay: 0,
      focusMode: false,
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
    tasks: [
      { id: 'calendar-check', name: 'カレンダー', description: '', enabled: true, type: 'builtin' },
      { id: 'feed-check', name: 'フィード', description: '', enabled: false, type: 'builtin' },
      { id: 'web-monitor-check', name: '監視', description: '', enabled: false, type: 'builtin' },
      { id: 'briefing-morning', name: '朝ブリ', description: '', enabled: false, type: 'builtin' },
      { id: 'weekly-summary', name: '週次', description: '', enabled: false, type: 'builtin' },
    ],
    desktopNotification: false,
    quietDays: [],
    maxNotificationsPerDay: 0,
    focusMode: false,
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
    await userEvent.click(screen.getByText('PM型'));

    const personalityInput = screen.getByPlaceholderText('例: 丁寧で親しみやすい') as HTMLInputElement;
    const toneInput = screen.getByPlaceholderText('例: カジュアル') as HTMLInputElement;

    expect(personalityInput.value).toBe('進行管理と優先順位付けを重視し、期限/依存関係を意識して提案する。');
    expect(toneInput.value).toBe('実務的かつ端的に。');
  });

  it('推奨プリセットを1クリック適用できる', async () => {
    render(<SetupWizard onComplete={vi.fn()} />);

    await userEvent.click(screen.getByText('はじめる'));
    await userEvent.type(screen.getByPlaceholderText('sk-...'), 'sk-test');
    await userEvent.click(screen.getByText('次へ'));

    await userEvent.click(screen.getByText('推奨プリセットを適用'));

    expect(screen.getByRole('button', { name: /情報収集型/ })).toBeInTheDocument();
    expect(screen.getByText(/フィード\/監視の変化を素早く要約/)).toBeInTheDocument();
    expect(screen.getByText(/有効化タスク:/)).toBeInTheDocument();
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

  it('プリセット適用時に suggestionFrequency と Heartbeat 推奨タスクが保存される', async () => {
    const { saveConfig } = await import('../core/config');
    render(<SetupWizard onComplete={vi.fn()} />);

    await userEvent.click(screen.getByText('はじめる'));
    await userEvent.type(screen.getByPlaceholderText('sk-...'), 'sk-test');
    await userEvent.click(screen.getByText('次へ'));
    await userEvent.click(screen.getByText('情報収集型'));
    await userEvent.click(screen.getByText('次へ'));
    await userEvent.click(screen.getByText('使い始める'));

    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      suggestionFrequency: 'high',
      persona: expect.objectContaining({
        personality: '情報の変化に敏感で、重要度順に要点を整理して伝える。',
        tone: '結論先行で簡潔に。',
      }),
      heartbeat: expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({ id: 'calendar-check', enabled: true }),
          expect.objectContaining({ id: 'feed-check', enabled: true }),
          expect.objectContaining({ id: 'web-monitor-check', enabled: true }),
          expect.objectContaining({ id: 'briefing-morning', enabled: true }),
          expect.objectContaining({ id: 'weekly-summary', enabled: false }),
        ]),
      }),
    }));
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
