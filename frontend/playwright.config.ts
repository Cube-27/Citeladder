import { defineConfig } from '@playwright/test';

const e2ePort = 3100;
const marketingPort = 3101;
const marketingSpecs = ['**/marketing-pages.spec.ts', '**/landing-nav.spec.ts', '**/smoke.spec.ts'];
const publicOrigins = {
  PUBLIC_WEBSITE_ORIGIN: `http://127.0.0.1:${marketingPort}`,
  PUBLIC_APP_ORIGIN: `http://127.0.0.1:${e2ePort}`,
};
// CI builds both sites in an earlier step (E2E_PREBUILT=1) so a build never eats the webServer start timeout.
const buildFirst = (script: string) =>
  process.env.E2E_PREBUILT === '1' ? '' : `pnpm ${script} && `;

export default defineConfig({
  testDir: './e2e',
  // Every test owns its browser context and stubs its own reads, so tests
  // spread across workers; CI's 4-vCPU runner takes one per core.
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
  // A retry only labels a test: in CI a test that fails once and then passes
  // is flaky, and flaky fails the run. The trace comes from the first,
  // failing attempt, which is the one that shows the defect.
  retries: 1,
  failOnFlakyTests: Boolean(process.env.CI),
  // `list` records every test's duration, so CI's log shows where time goes.
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'retain-on-first-failure',
  },
  // Each suite exercises its owning runtime; marketing must never hit SPA fallback.
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
      // The built SPA, as it ships: a dev server transforms hundreds of
      // modules on every full page load, which made each navigation cost
      // seconds. `LOCAL_COMPOSE_BUILD` admits the local HTTP origins.
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
