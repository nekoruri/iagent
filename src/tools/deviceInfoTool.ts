import { tool } from '@openai/agents';
import { z } from 'zod';
import { getConfigValue } from '../core/config';

interface BatteryManager {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
}

async function getBattery(): Promise<string> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) {
      return JSON.stringify({ error: 'Battery API非対応のブラウザです' });
    }
    const battery = await nav.getBattery();
    return JSON.stringify({
      level: `${Math.round(battery.level * 100)}%`,
      charging: battery.charging,
      chargingTime: battery.chargingTime === Infinity ? null : battery.chargingTime,
      dischargingTime: battery.dischargingTime === Infinity ? null : battery.dischargingTime,
    });
  } catch {
    return JSON.stringify({ error: 'バッテリー情報を取得できませんでした' });
  }
}

async function getLocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 10000 },
    );
  });
}

async function getWeather(lat: number, lon: number): Promise<string> {
  const apiKey = getConfigValue('openWeatherMapApiKey');
  if (!apiKey) {
    return JSON.stringify({ error: 'OpenWeatherMap APIキーが設定されていません' });
  }
  try {
    const res = await fetch(
      `/api/weather/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=ja&appid=${apiKey}`,
    );
    if (!res.ok) {
      return JSON.stringify({ error: `天気API エラー: ${res.status}` });
    }
    const data = await res.json();
    return JSON.stringify({
      location: data.name,
      weather: data.weather?.[0]?.description,
      temperature: `${data.main?.temp}°C`,
      humidity: `${data.main?.humidity}%`,
      wind: `${data.wind?.speed}m/s`,
    });
  } catch {
    return JSON.stringify({ error: '天気情報を取得できませんでした' });
  }
}

export const deviceInfoTool = tool({
  name: 'device_info',
  description: 'デバイス情報を取得します。バッテリー残量、現在地の緯度経度、現在地の天気を取得できます。type に "battery", "location", "weather", "all" のいずれかを指定してください。',
  parameters: z.object({
    type: z.enum(['battery', 'location', 'weather', 'all']),
  }),
  execute: async ({ type }) => {
    const results: Record<string, unknown> = {};

    if (type === 'battery' || type === 'all') {
      results.battery = JSON.parse(await getBattery());
    }

    if (type === 'location' || type === 'weather' || type === 'all') {
      const loc = await getLocation();
      if (loc) {
        results.location = loc;
        if (type === 'weather' || type === 'all') {
          results.weather = JSON.parse(await getWeather(loc.lat, loc.lon));
        }
      } else {
        results.location = { error: '位置情報を取得できませんでした。ブラウザの位置情報権限を確認してください。' };
      }
    }

    return JSON.stringify(results);
  },
});
