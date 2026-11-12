import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/environment.ts', 'test/queue-isolation.ts'],
    // Database tests share one PostgreSQL; files run one at a time.
    fileParallelism: false,
    // Measured and published, never a gate (docs/DEVELOPMENT.md#coverage).
    // CI passes `--coverage`; a local run stays uninstrumented.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
    },
  },
});
