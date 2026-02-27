import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useViewportHeight } from './useViewportHeight';

describe('useViewportHeight', () => {
  let setPropertySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--app-height');
  });

  it('マウント時に --app-height が設定される', () => {
    // visualViewport が利用可能な環境をシミュレート
    const mockViewport = {
      height: 700,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', mockViewport);

    renderHook(() => useViewportHeight());

    expect(setPropertySpy).toHaveBeenCalledWith('--app-height', '700px');
  });

  it('visualViewport の resize イベントで --app-height が更新される', () => {
    let resizeHandler: (() => void) | undefined;
    const mockViewport = {
      height: 700,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'resize') resizeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', mockViewport);

    renderHook(() => useViewportHeight());

    // キーボード表示をシミュレート
    mockViewport.height = 400;
    resizeHandler!();

    expect(setPropertySpy).toHaveBeenCalledWith('--app-height', '400px');
  });

  it('VisualViewport 非対応時は window.resize にフォールバック', () => {
    vi.stubGlobal('visualViewport', undefined);
    const addSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useViewportHeight());

    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(setPropertySpy).toHaveBeenCalledWith(
      '--app-height',
      `${window.innerHeight}px`,
    );
  });

  it('アンマウント時に visualViewport リスナーが解除される', () => {
    const mockViewport = {
      height: 700,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', mockViewport);

    const { unmount } = renderHook(() => useViewportHeight());
    unmount();

    expect(mockViewport.removeEventListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    );
  });

  it('アンマウント時に window resize リスナーが解除される（フォールバック）', () => {
    vi.stubGlobal('visualViewport', undefined);
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useViewportHeight());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
