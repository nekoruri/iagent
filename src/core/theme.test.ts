import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../store/configStore', () => ({
  saveConfigToIDB: vi.fn().mockResolvedValue(undefined),
}));

import { resolveTheme, applyTheme, getStoredThemeMode, THEME_COLORS } from './theme';

describe('resolveTheme', () => {
  it('dark モードは dark を返す', () => {
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('light モードは light を返す', () => {
    expect(resolveTheme('light')).toBe('light');
  });

  it('system モードで OS がダーク設定なら dark を返す', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(resolveTheme('system')).toBe('dark');
  });

  it('system モードで OS がライト設定なら light を返す', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = '';
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', '');
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  });

  it('dark テーマを適用すると data-theme="dark" が設定される', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('light テーマを適用すると data-theme="light" が設定される', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('theme-color meta タグが更新される', () => {
    applyTheme('light');
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe(THEME_COLORS.light);
  });

  it('dark テーマで theme-color が dark カラーになる', () => {
    applyTheme('dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe(THEME_COLORS.dark);
  });
});

describe('getStoredThemeMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage が空のとき system を返す', () => {
    expect(getStoredThemeMode()).toBe('system');
  });

  it('保存済み theme が dark のとき dark を返す', () => {
    localStorage.setItem('iagent-config', JSON.stringify({ theme: 'dark' }));
    expect(getStoredThemeMode()).toBe('dark');
  });

  it('保存済み theme が light のとき light を返す', () => {
    localStorage.setItem('iagent-config', JSON.stringify({ theme: 'light' }));
    expect(getStoredThemeMode()).toBe('light');
  });

  it('保存済み theme が system のとき system を返す', () => {
    localStorage.setItem('iagent-config', JSON.stringify({ theme: 'system' }));
    expect(getStoredThemeMode()).toBe('system');
  });

  it('不正な theme 値のとき system を返す', () => {
    localStorage.setItem('iagent-config', JSON.stringify({ theme: 'invalid' }));
    expect(getStoredThemeMode()).toBe('system');
  });

  it('theme フィールドがないとき system を返す', () => {
    localStorage.setItem('iagent-config', JSON.stringify({ openaiApiKey: 'sk-test' }));
    expect(getStoredThemeMode()).toBe('system');
  });
});

describe('THEME_COLORS', () => {
  it('dark と light のカラーが定義されている', () => {
    expect(THEME_COLORS.dark).toBe('#0f0f0f');
    expect(THEME_COLORS.light).toBe('#ffffff');
  });
});
