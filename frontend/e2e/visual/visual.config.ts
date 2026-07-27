import { defineConfig } from '@playwright/test';

/**
 * Screenshot-baseline config. Kept separate from playwright.config.ts so
 * `pnpm test:e2e` stays fast and the visual suite is opt-in
 * (`pnpm test:visual` / `pnpm test:visual:update`). Deliberately NOT part of
 * check:policy — that chain is static Node scripts with no browser and no
 * server.
 *
 * Determinism comes from: retries 0, reducedMotion 'reduce' (globals.css and
 * marketing-motion.css both have reduce branches, and RotatingEngineLabel
 * never starts its interval), deviceScaleFactor 1, caret hidden, CSS/JS
 * animations fast-forwarded, and the app-fixture 404 catch-all that settles
 * every unstubbed query in ONE attempt (4xx never retries, per
 * lib/api/query-client.ts) instead of flapping between skeleton and error.
 */
export default defineConfig({
  testDir: '.',
  retries: 0,
  fullyParallel: true,
  // First-hit route compilation under `next dev` can outlast the stock 30s;
  // warm runs finish in a fraction of this.
  timeout: 90_000,
  expect: {
    timeout: 20_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    deviceScaleFactor: 1,
    // Playwright 1.61 removed the first-class `reducedMotion` use-option;
    // contextOptions is spread verbatim into browser.newContext, so this is
    // the supported (and typed) path to emulate prefers-reduced-motion.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  // Pinned explicitly so the desktop/mobile split in marketing-routes.spec.ts
  // can never silently overwrite itself if Playwright's default changes.
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
