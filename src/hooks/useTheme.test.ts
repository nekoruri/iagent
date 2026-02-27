import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../store/configStore', () => ({
  saveConfigToIDB: vi.fn().mockResolvedValue(undefined),
}));

import { useTheme } from './useTheme';

describe('useTheme', () => {
  let addEventListenerSpy: ReturnType<typeof vi.fn>;
  let removeEventListenerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = '';

    // theme-color meta タグ
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }

    addEventListenerSpy = vi.fn();
    removeEventListenerSpy = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
    });
  });

  it('初期値は system（デフォルト）', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe('system');
  });

  it('保存済み設定から初期テーマを読み込む', () => {
    localStorage.setItem('iagent-config', JSON.stringify({ theme: 'dark' }));
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe('dark');
    expect(result.current.resolved).toBe('dark');
  });

  it('setMode でテーマを変更すると DOM に反映される', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setMode('light');
    });
    expect(result.current.mode).toBe('light');
    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('setMode で localStorage に保存される', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setMode('dark');
    });
    const stored = JSON.parse(localStorage.getItem('iagent-config')!);
    expect(stored.theme).toBe('dark');
  });

  it('system モード時に matchMedia change イベントをリッスンする', () => {
    renderHook(() => useTheme());
    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('system モード以外では matchMedia リスナーが解除される', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setMode('dark');
    });
    expect(removeEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
