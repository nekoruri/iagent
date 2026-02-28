import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstallPrompt } from './InstallPrompt';

vi.mock('../core/installDetect', () => ({
  shouldShowInstallPrompt: vi.fn(() => false),
  dismissInstallPrompt: vi.fn(),
}));

import { shouldShowInstallPrompt, dismissInstallPrompt } from '../core/installDetect';

describe('InstallPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shouldShowInstallPrompt() が false のとき何も表示しない', () => {
    vi.mocked(shouldShowInstallPrompt).mockReturnValue(false);
    const { container } = render(<InstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('shouldShowInstallPrompt() が true のときバナーを表示する', () => {
    vi.mocked(shouldShowInstallPrompt).mockReturnValue(true);
    render(<InstallPrompt />);
    expect(screen.getByText('ホーム画面に追加して快適に使おう')).toBeInTheDocument();
  });

  it('ステップガイドが表示される', () => {
    vi.mocked(shouldShowInstallPrompt).mockReturnValue(true);
    render(<InstallPrompt />);
    expect(screen.getByText(/共有ボタンをタップ/)).toBeInTheDocument();
    expect(screen.getByText(/ホーム画面に追加.*をタップ/)).toBeInTheDocument();
  });

  it('ヒントテキストが表示される', () => {
    vi.mocked(shouldShowInstallPrompt).mockReturnValue(true);
    render(<InstallPrompt />);
    expect(screen.getByText('Push 通知やデータの永続化が有効になります')).toBeInTheDocument();
  });

  it('閉じるボタンで dismissInstallPrompt が呼ばれバナーが非表示になる', () => {
    vi.mocked(shouldShowInstallPrompt).mockReturnValue(true);
    render(<InstallPrompt />);
    const closeButton = screen.getByRole('button', { name: 'インストール案内を閉じる' });
    fireEvent.click(closeButton);
    expect(dismissInstallPrompt).toHaveBeenCalled();
    expect(screen.queryByText('ホーム画面に追加して快適に使おう')).not.toBeInTheDocument();
  });

  it('閉じるボタンに install-prompt-close クラスが付与される', () => {
    vi.mocked(shouldShowInstallPrompt).mockReturnValue(true);
    render(<InstallPrompt />);
    const closeButton = screen.getByRole('button', { name: 'インストール案内を閉じる' });
    expect(closeButton.className).toContain('install-prompt-close');
  });

  it('role="status" が設定されている', () => {
    vi.mocked(shouldShowInstallPrompt).mockReturnValue(true);
    render(<InstallPrompt />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
