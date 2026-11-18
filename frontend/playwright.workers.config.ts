import { defineConfig } from '@playwright/test';

// Build both artifacts before this suite. Exercise real Workerd GET responses,
// including direct assets; Vite development responses cannot prove edge CSP.
export default defineConfig({
  testDir: './e2e',
  projects: [
    { name: 'policy', testMatch: 'worker-csp.spec.ts' },
    {
      name: 'app',
      testMatch: 'performance-states.spec.ts',
      use: { baseURL: 'http://127.0.0.1:8793' },
    },
    {
      name: 'marketing',
      testMatch: 'marketing-pages.spec.ts',
      grep: /Google Analytics waits for an explicit cookie acceptance/,
      use: { baseURL: 'http://127.0.0.1:8794' },
    },
  ],
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results/workers',
  use: { ignoreHTTPSErrors: true, trace: 'retain-on-failure' },
  webServer: [
    // Both listen on plain HTTP: wrangler's local TLS listener stops answering after a
    // burst of handshakes (the app's ~80-chunk first load; marketing's /pricing after
    // Chromium's CertificateUnknown rejections), hanging page.goto. `--upstream-protocol
    // https` still hands each Worker https:// URLs; production TLS ends at Cloudflare's edge.
    {
      command:
        'pnpm exec wrangler dev -c apps/app/wrangler.jsonc --local --ip 127.0.0.1 --port 8793 --local-upstream 127.0.0.1 --local-protocol http --upstream-protocol https --var PUBLIC_APP_HOST:127.0.0.1 --var ORIGIN_UPSTREAM:https://127.0.0.1:9443 --var ORIGIN_TOKEN:local-dev-only-token-32-characters',
      url: 'http://127.0.0.1:8793/health',
      ignoreHTTPSErrors: true,
    },
    {
      command:
        'pnpm exec wrangler dev -c apps/marketing/dist/server/wrangler.json --local --ip 127.0.0.1 --port 8794 --local-upstream 127.0.0.1 --local-protocol http --upstream-protocol https --var PUBLIC_WEBSITE_HOST:127.0.0.1 --var ORIGIN_UPSTREAM:https://127.0.0.1:9443 --var ORIGIN_TOKEN:local-dev-only-token-32-characters',
      url: 'http://127.0.0.1:8794/',
      ignoreHTTPSErrors: true,
    },
  ],
});
