import { useState, useEffect, useCallback } from 'react';
import { getConfig, saveConfig } from '../core/config';
import { applyTheme, resolveTheme } from '../core/theme';
import type { ThemeMode } from '../types';

interface UseThemeResult {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

export function useTheme(): UseThemeResult {
  const [mode, setModeState] = useState<ThemeMode>(() => getConfig().theme ?? 'system');
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(mode));

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    applyTheme(newMode);
    setResolved(resolveTheme(newMode));

    // config に保存
    const config = getConfig();
    saveConfig({ ...config, theme: newMode });
  }, []);

  // system モード時に OS 設定変更をリッスン
  useEffect(() => {
    if (mode !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      applyTheme('system');
      setResolved(resolveTheme('system'));
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  return { mode, resolved, setMode };
}
