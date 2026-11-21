import { defineConfig } from '@playwright/test';

const e2ePort = 3100;
const marketingPort = 3101;
const marketingSpecs = ['**/marketing-pages.spec.ts', '**/landing-nav.spec.ts', '**/smoke.spec.ts'];
const publicOrigins = {
  PUBLIC_WEBSITE_ORIGIN: `http://127.0.0.1:${marketingPort}`,
  PUBLIC_APP_ORIGIN: `http://127.0.0.1:${e2ePort}`,
};
const buildFirst = (script: string) =>
  process.env.E2E_PREBUILT === '1' ? '' : `pnpm ${script} && `;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
  retries: 1,
  failOnFlakyTests: Boolean(process.env.CI),
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'retain-on-first-failure',
  },
  projects: [
    { name: 'app', testIgnore: [...marketingSpecs, '**/docs.spec.ts', '**/worker-csp.spec.ts'] },
    {
      name: 'marketing',
      testMatch: marketingSpecs,
      use: { baseURL: `http://127.0.0.1:${marketingPort}` },
    },
  ],
  webServer: [
    {
      command: `${buildFirst('build:vite')}pnpm exec vp preview -c apps/app/vite.config.ts --port ${e2ePort}`,
      env: { ...publicOrigins, LOCAL_COMPOSE_BUILD: 'true' },
      url: `http://127.0.0.1:${e2ePort}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `${buildFirst('build:marketing')}pnpm exec wrangler dev -c apps/marketing/dist/server/wrangler.json --local --ip 127.0.0.1 --port ${marketingPort} --var ORIGIN_UPSTREAM:https://127.0.0.1:9443 --var ORIGIN_TOKEN:local-dev-only-token-32-characters --var LOCAL_WORKER_ORIGIN:true`,
      env: {
        ...publicOrigins,
        LOCAL_COMPOSE_BUILD: 'true',
        NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-CONSENTTEST',
      },
      url: `http://127.0.0.1:${marketingPort}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
