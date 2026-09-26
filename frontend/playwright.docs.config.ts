import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
  encoding: 'utf8',
  windowsHide: true,
}).trim();

export default defineConfig({
  testDir: './e2e',
  testMatch: 'docs.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: join(gitDirectory, 'docs-browser-results'),
  use: { baseURL: 'http://127.0.0.1:4322', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm preview:docs',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: !process.env.CI,
  },
});
