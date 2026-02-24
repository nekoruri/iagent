import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      include: ['src/core/**', 'src/store/**', 'src/telemetry/**'],
      thresholds: {
        statements: 70,
      },
    },
  },
});
