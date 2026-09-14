import { defineConfig } from '@playwright/test';

const e2ePort = 3100;
const marketingPort = 3101;
const marketingSpecs = ['**/marketing-pages.spec.ts', '**/landing-nav.spec.ts', '**/smoke.spec.ts'];

export default defineConfig({
  testDir: './e2e',
  // The real-stack integration spec owns its own lifecycle + config; run it
  // explicitly with `--config e2e/content-integration.config.ts`.
  testIgnore: ['**/content-integration.spec.ts'],
  // Each suite exercises its owning runtime; marketing must never hit SPA fallback.
  workers: 1,
  retries: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'app', testIgnore: [...marketingSpecs, '**/content-integration.spec.ts'] },
    {
      name: 'marketing',
      testMatch: marketingSpecs,
      use: { baseURL: `http://127.0.0.1:${marketingPort}` },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --config apps/app/vite.config.ts --port ${e2ePort}`,
      url: `http://127.0.0.1:${e2ePort}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec astro dev --root apps/marketing --host 127.0.0.1 --port ${marketingPort}`,
      // Playwright owns the process lifecycle. Prevent Astro's agent detection
      // from spawning a detached background server outside that lifecycle.
      env: { ASTRO_DEV_BACKGROUND: '1' },
      url: `http://127.0.0.1:${marketingPort}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
