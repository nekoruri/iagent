import type { ThemeMode } from '../types';

const STORAGE_KEY = 'iagent-config';

export const THEME_COLORS = {
  dark: '#0f0f0f',
  light: '#ffffff',
} as const;

/** system モードを実際のテーマに解決 */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

/** テーマを DOM に適用（data-theme 属性 + theme-color meta タグ） */
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_COLORS[resolved]);
  }
}

/** localStorage から保存済みテーマモードを取得（デフォルト: 'system'） */
export function getStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'system';
    const parsed = JSON.parse(raw);
    const theme = parsed?.theme;
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      return theme;
    }
  } catch {
    // パースエラー時はデフォルト
  }
  return 'system';
}
