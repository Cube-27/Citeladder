import { defineConfig } from '@playwright/test';

const e2ePort = 3100;
const marketingPort = 3101;
const marketingSpecs = ['**/marketing-pages.spec.ts', '**/landing-nav.spec.ts', '**/smoke.spec.ts'];

export default defineConfig({
  testDir: './e2e',
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
    { name: 'app', testIgnore: [...marketingSpecs, '**/docs.spec.ts'] },
    {
      name: 'marketing',
      testMatch: marketingSpecs,
      use: { baseURL: `http://127.0.0.1:${marketingPort}` },
    },
  ],
  webServer: [
    {
      // `vp dev` is the Vite+ dev command; the standalone `vite` binary no
      // longer exists once the toolchain is bundled by vite-plus.
      command: `pnpm exec vp dev -c apps/app/vite.config.ts --port ${e2ePort}`,
      env: {
        PUBLIC_WEBSITE_ORIGIN: `http://127.0.0.1:${marketingPort}`,
        PUBLIC_APP_ORIGIN: `http://127.0.0.1:${e2ePort}`,
      },
      url: `http://127.0.0.1:${e2ePort}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm build:marketing && pnpm exec wrangler dev -c apps/marketing/dist/server/wrangler.json --local --ip 127.0.0.1 --port ${marketingPort} --var ORIGIN_UPSTREAM:https://127.0.0.1:9443 --var ORIGIN_TOKEN:local-dev-only-token-32-characters --var LOCAL_WORKER_ORIGIN:true`,
      env: {
        LOCAL_COMPOSE_BUILD: 'true',
        PUBLIC_WEBSITE_ORIGIN: `http://127.0.0.1:${marketingPort}`,
        PUBLIC_APP_ORIGIN: `http://127.0.0.1:${e2ePort}`,
        NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-CONSENTTEST',
      },
      url: `http://127.0.0.1:${marketingPort}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
