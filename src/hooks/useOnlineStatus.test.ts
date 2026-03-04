import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

describe('useOnlineStatus', () => {
  afterEach(() => {
    // navigator.onLine をデフォルトに戻す
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
  });

  it('初期値は navigator.onLine を反映する', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('navigator.onLine が false の場合、初期値は false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it('offline イベントで false に変化する', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });

  it('online イベントで true に復帰する', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });

  it('アンマウント時にイベントリスナーがクリーンアップされる', () => {
    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();

    // アンマウント後のイベント発火でエラーが出ないことを確認
    expect(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    }).not.toThrow();
  });
});
