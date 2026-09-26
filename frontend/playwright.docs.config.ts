import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'docs.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results/docs',
  use: { baseURL: 'http://127.0.0.1:4322', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm preview:docs',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: !process.env.CI,
  },
});
