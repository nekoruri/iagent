import { useEffect } from 'react';

/**
 * iOS Safari キーボード表示時のレイアウト崩れを防止するフック。
 * VisualViewport API で可視領域の高さを取得し、CSS 変数 --app-height に反映する。
 */
export function useViewportHeight(): void {
  useEffect(() => {
    function updateHeight() {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
    }

    updateHeight();

    // VisualViewport API 対応ブラウザ（iOS Safari, 主要モダンブラウザ）
    const viewport = window.visualViewport;
    if (viewport) {
      viewport.addEventListener('resize', updateHeight);
      return () => viewport.removeEventListener('resize', updateHeight);
    }

    // フォールバック: window resize
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);
}
