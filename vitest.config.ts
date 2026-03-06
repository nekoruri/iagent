import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'server/**'],
    coverage: {
      include: ['src/core/**', 'src/store/**', 'src/telemetry/**', 'src/tools/**', 'src/hooks/**', 'src/components/**'],
      thresholds: {
        statements: 70,
      },
    },
  },
});
