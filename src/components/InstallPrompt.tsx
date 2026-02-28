import { useState, useEffect } from 'react';
import { shouldShowInstallPrompt, dismissInstallPrompt } from '../core/installDetect';

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(shouldShowInstallPrompt());
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    dismissInstallPrompt();
    setVisible(false);
  };

  return (
    <div className="install-prompt" role="status">
      <div className="install-prompt-content">
        <p className="install-prompt-title">ホーム画面に追加して快適に使おう</p>
        <div className="install-prompt-steps">
          <span className="install-step-badge">
            <span className="install-step-icon" aria-hidden="true">&#xFEFF;⬆&#xFE0E;</span> 共有ボタンをタップ
          </span>
          <span className="install-step-arrow" aria-hidden="true">→</span>
          <span className="install-step-badge">
            「ホーム画面に追加」をタップ
          </span>
        </div>
        <p className="install-prompt-hint">Push 通知やデータの永続化が有効になります</p>
      </div>
      <button
        className="install-prompt-close"
        onClick={handleDismiss}
        aria-label="インストール案内を閉じる"
        type="button"
      >
        ✕
      </button>
    </div>
  );
}
