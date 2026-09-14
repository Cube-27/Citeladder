import { defineConfig } from '@playwright/test';

const e2ePort = 3100;

export default defineConfig({
  testDir: './e2e',
  // The real-stack integration spec owns its own lifecycle + config; run it
  // explicitly with `--config e2e/content-integration.config.ts`.
  testIgnore: ['**/content-integration.spec.ts'],
  // One Vite product-app dev server owns the browser suite; serial work keeps
  // stateful fixture navigation deterministic.
  workers: 1,
  retries: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec vite --config apps/app/vite.config.ts --port ${e2ePort}`,
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: !process.env.CI,
  },
});
