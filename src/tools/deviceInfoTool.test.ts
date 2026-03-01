import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetConfigValue = vi.fn();
vi.mock('../core/config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
}));

import { deviceInfoTool } from './deviceInfoTool';

/** ツールを呼び出すヘルパー */
async function invoke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await deviceInfoTool.invoke({}, JSON.stringify(params));
  return JSON.parse(result);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// --- テスト用ヘルパー ---

function stubNavigator(overrides: Record<string, unknown>) {
  vi.stubGlobal('navigator', { ...navigator, ...overrides });
}

function stubBattery(battery: { level: number; charging: boolean; chargingTime: number; dischargingTime: number }) {
  stubNavigator({
    getBattery: vi.fn().mockResolvedValue(battery),
  });
}

function stubGeolocation(coords: { latitude: number; longitude: number } | null) {
  const getCurrentPosition = coords
    ? vi.fn((success: PositionCallback) => success({ coords } as GeolocationPosition))
    : vi.fn((_: PositionCallback, error: PositionErrorCallback) => error({} as GeolocationPositionError));

  stubNavigator({ geolocation: { getCurrentPosition } });
}

function stubFullNavigator(
  battery: { level: number; charging: boolean; chargingTime: number; dischargingTime: number },
  coords: { latitude: number; longitude: number },
) {
  vi.stubGlobal('navigator', {
    ...navigator,
    getBattery: vi.fn().mockResolvedValue(battery),
    geolocation: {
      getCurrentPosition: vi.fn((success: PositionCallback) =>
        success({ coords } as GeolocationPosition)),
    },
  });
}

function stubWeatherFetch(weatherData: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(weatherData),
  }));
}

describe('deviceInfoTool 定義', () => {
  it('ツール名が設定されている', () => {
    expect(deviceInfoTool.name).toBe('device_info');
  });
});

describe('deviceInfoTool invoke', () => {
  // --- battery ---
  describe('type: battery', () => {
    it('バッテリー情報を返す', async () => {
      stubBattery({ level: 0.75, charging: true, chargingTime: 1800, dischargingTime: Infinity });
      const parsed = await invoke({ type: 'battery' });
      expect(parsed.battery).toEqual({
        level: '75%',
        charging: true,
        chargingTime: 1800,
        dischargingTime: null,
      });
    });

    it('Infinity の時間は null に変換する', async () => {
      stubBattery({ level: 0.5, charging: false, chargingTime: Infinity, dischargingTime: 3600 });
      const parsed = await invoke({ type: 'battery' });
      const bat = parsed.battery as Record<string, unknown>;
      expect(bat.chargingTime).toBeNull();
      expect(bat.dischargingTime).toBe(3600);
    });

    it('Battery API 非対応の場合はエラーを返す', async () => {
      stubNavigator({ getBattery: undefined });
      const parsed = await invoke({ type: 'battery' });
      expect((parsed.battery as Record<string, unknown>).error).toContain('Battery API非対応');
    });
  });

  // --- location ---
  describe('type: location', () => {
    it('位置情報を返す', async () => {
      stubGeolocation({ latitude: 35.6762, longitude: 139.6503 });
      const parsed = await invoke({ type: 'location' });
      expect(parsed.location).toEqual({ lat: 35.6762, lon: 139.6503 });
    });

    it('位置情報取得失敗時はエラーを返す', async () => {
      stubGeolocation(null);
      const parsed = await invoke({ type: 'location' });
      expect((parsed.location as Record<string, unknown>).error).toContain('位置情報を取得できませんでした');
    });

    it('Geolocation API 非対応の場合はエラーを返す', async () => {
      stubNavigator({ geolocation: undefined });
      const parsed = await invoke({ type: 'location' });
      expect((parsed.location as Record<string, unknown>).error).toContain('位置情報を取得できませんでした');
    });
  });

  // --- weather ---
  describe('type: weather', () => {
    it('天気情報を返す', async () => {
      stubGeolocation({ latitude: 35.68, longitude: 139.65 });
      mockGetConfigValue.mockReturnValue('weather-api-key');
      stubWeatherFetch({
        name: 'Tokyo',
        weather: [{ description: '晴れ' }],
        main: { temp: 22.5, humidity: 45 },
        wind: { speed: 3.2 },
      });

      const parsed = await invoke({ type: 'weather' });
      expect(parsed.location).toEqual({ lat: 35.68, lon: 139.65 });
      expect(parsed.weather).toEqual({
        location: 'Tokyo',
        weather: '晴れ',
        temperature: '22.5°C',
        humidity: '45%',
        wind: '3.2m/s',
      });
    });

    it('API キーが未設定の場合はエラーを返す', async () => {
      stubGeolocation({ latitude: 35.68, longitude: 139.65 });
      mockGetConfigValue.mockReturnValue('');
      const parsed = await invoke({ type: 'weather' });
      expect((parsed.weather as Record<string, unknown>).error).toContain('APIキーが設定されていません');
    });

    it('位置情報取得失敗時は天気も取得しない', async () => {
      stubGeolocation(null);
      mockGetConfigValue.mockReturnValue('weather-api-key');
      const parsed = await invoke({ type: 'weather' });
      expect((parsed.location as Record<string, unknown>).error).toBeDefined();
      expect(parsed.weather).toBeUndefined();
    });

    it('天気 API エラー時はエラーを返す', async () => {
      stubGeolocation({ latitude: 35.68, longitude: 139.65 });
      mockGetConfigValue.mockReturnValue('weather-api-key');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const parsed = await invoke({ type: 'weather' });
      expect((parsed.weather as Record<string, unknown>).error).toContain('天気API エラー: 500');
    });

    it('fetch 例外時はエラーを返す', async () => {
      stubGeolocation({ latitude: 35.68, longitude: 139.65 });
      mockGetConfigValue.mockReturnValue('weather-api-key');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ネットワークエラー')));

      const parsed = await invoke({ type: 'weather' });
      expect((parsed.weather as Record<string, unknown>).error).toBe('天気情報を取得できませんでした');
    });
  });

  // --- all ---
  describe('type: all', () => {
    it('全情報をまとめて返す', async () => {
      stubFullNavigator(
        { level: 0.9, charging: false, chargingTime: Infinity, dischargingTime: 7200 },
        { latitude: 35.68, longitude: 139.65 },
      );
      mockGetConfigValue.mockReturnValue('weather-api-key');
      stubWeatherFetch({
        name: 'Tokyo',
        weather: [{ description: '曇り' }],
        main: { temp: 18.0, humidity: 60 },
        wind: { speed: 2.0 },
      });

      const parsed = await invoke({ type: 'all' });
      expect(parsed.battery).toBeDefined();
      expect(parsed.location).toBeDefined();
      expect(parsed.weather).toBeDefined();
    });
  });
});
