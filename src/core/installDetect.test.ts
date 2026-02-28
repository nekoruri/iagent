import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// テスト対象を動的 import（UA モック後にモジュール評価するため）
function freshImport() {
  vi.resetModules();
  return import('./installDetect');
}

function mockUA(ua: string, touchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: touchPoints,
    writable: true,
    configurable: true,
  });
}

function mockStandalone(value: boolean | undefined) {
  Object.defineProperty(navigator, 'standalone', {
    value,
    writable: true,
    configurable: true,
  });
}

describe('installDetect', () => {
  const originalUA = navigator.userAgent;
  const originalTouchPoints = navigator.maxTouchPoints;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // standalone を未定義にリセット
    mockStandalone(undefined);
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: originalTouchPoints,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  describe('isIOSSafari', () => {
    it('iPhone の UA で true を返す', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
      const { isIOSSafari } = await freshImport();
      expect(isIOSSafari()).toBe(true);
    });

    it('iPad の UA で true を返す', async () => {
      mockUA('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
      const { isIOSSafari } = await freshImport();
      expect(isIOSSafari()).toBe(true);
    });

    it('iPadOS 13+ (Mac 偽装) で maxTouchPoints > 1 なら true を返す', async () => {
      mockUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5);
      const { isIOSSafari } = await freshImport();
      expect(isIOSSafari()).toBe(true);
    });

    it('Mac Desktop (maxTouchPoints = 0) で false を返す', async () => {
      mockUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0);
      const { isIOSSafari } = await freshImport();
      expect(isIOSSafari()).toBe(false);
    });

    it('Android で false を返す', async () => {
      mockUA('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36');
      const { isIOSSafari } = await freshImport();
      expect(isIOSSafari()).toBe(false);
    });

    it('Windows で false を返す', async () => {
      mockUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      const { isIOSSafari } = await freshImport();
      expect(isIOSSafari()).toBe(false);
    });
  });

  describe('isStandaloneMode', () => {
    it('navigator.standalone === true で true を返す', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      mockStandalone(true);
      const { isStandaloneMode } = await freshImport();
      expect(isStandaloneMode()).toBe(true);
    });

    it('display-mode: standalone マッチで true を返す', async () => {
      mockUA('Mozilla/5.0 (Linux; Android 14)');
      mockStandalone(undefined);
      window.matchMedia = vi.fn().mockReturnValue({ matches: true });
      const { isStandaloneMode } = await freshImport();
      expect(isStandaloneMode()).toBe(true);
    });

    it('どちらも false のとき false を返す', async () => {
      mockUA('Mozilla/5.0 (Windows NT 10.0)');
      mockStandalone(false);
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });
      const { isStandaloneMode } = await freshImport();
      expect(isStandaloneMode()).toBe(false);
    });
  });

  describe('shouldShowInstallPrompt', () => {
    it('iOS + ブラウザ + 未 dismiss で true を返す', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      mockStandalone(false);
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });
      const { shouldShowInstallPrompt } = await freshImport();
      expect(shouldShowInstallPrompt()).toBe(true);
    });

    it('iOS でもスタンドアロンモードなら false を返す', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      mockStandalone(true);
      const { shouldShowInstallPrompt } = await freshImport();
      expect(shouldShowInstallPrompt()).toBe(false);
    });

    it('iOS でなければ false を返す', async () => {
      mockUA('Mozilla/5.0 (Linux; Android 14)');
      const { shouldShowInstallPrompt } = await freshImport();
      expect(shouldShowInstallPrompt()).toBe(false);
    });

    it('dismiss 済みなら false を返す', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      mockStandalone(false);
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });
      localStorage.setItem('iagent-install-prompt-dismissed', '1');
      const { shouldShowInstallPrompt } = await freshImport();
      expect(shouldShowInstallPrompt()).toBe(false);
    });
  });

  describe('dismissInstallPrompt', () => {
    it('localStorage にフラグを書き込む', async () => {
      const { dismissInstallPrompt } = await freshImport();
      dismissInstallPrompt();
      expect(localStorage.getItem('iagent-install-prompt-dismissed')).toBe('1');
    });

    it('dismiss 後は shouldShowInstallPrompt が false を返す', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      mockStandalone(false);
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });
      const { shouldShowInstallPrompt, dismissInstallPrompt } = await freshImport();
      expect(shouldShowInstallPrompt()).toBe(true);
      dismissInstallPrompt();
      expect(shouldShowInstallPrompt()).toBe(false);
    });
  });
});
