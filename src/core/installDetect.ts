const DISMISS_KEY = 'iagent-install-prompt-dismissed';

/**
 * iOS Safari かどうかを判定する。
 * iPadOS 13+ は Mac を偽装するため maxTouchPoints で検出。
 */
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  // iPhone / iPad / iPod
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ (Mac を偽装)
  if (ua.includes('Macintosh') && navigator.maxTouchPoints > 1) return true;
  return false;
}

/**
 * PWA としてインストール済み（スタンドアロンモード）かどうかを判定する。
 */
export function isStandaloneMode(): boolean {
  // iOS Safari 独自プロパティ
  if ((navigator as { standalone?: boolean }).standalone === true) return true;
  // 標準 display-mode メディアクエリ
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

/**
 * インストール案内バナーを表示すべきかどうかを判定する。
 * 条件: iOS Safari && スタンドアロンでない && ユーザーが非表示にしていない
 */
export function shouldShowInstallPrompt(): boolean {
  if (!isIOSSafari()) return false;
  if (isStandaloneMode()) return false;
  if (localStorage.getItem(DISMISS_KEY) === '1') return false;
  return true;
}

/**
 * インストール案内バナーを永続的に非表示にする。
 */
export function dismissInstallPrompt(): void {
  localStorage.setItem(DISMISS_KEY, '1');
}
