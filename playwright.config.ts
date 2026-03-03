import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: /push-integration/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
    },
  },
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/mobile/, /push-integration/, /\.vrt\./],
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile/,
      testIgnore: [/\.vrt\./],
    },
    // VRT 専用プロジェクト
    {
      name: 'vrt-desktop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\.vrt\./,
      testIgnore: [/mobile\.vrt\./],
    },
    {
      name: 'vrt-mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.vrt\./,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
