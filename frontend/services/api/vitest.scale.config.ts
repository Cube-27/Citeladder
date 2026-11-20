import { defineConfig } from 'vitest/config';

/**
 * The Site Health scale fixture (`test/scale`): one generated crawl of
 * thousands of pages, run by its own CI job. A run takes minutes, so the
 * timeout is this config's, not a per-test one.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/scale/**/*.scale.ts'],
    setupFiles: ['test/environment.ts', 'test/queue-isolation.ts'],
    fileParallelism: false,
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
  },
});
