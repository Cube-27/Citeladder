/**
 * `pnpm migrate`: the migrate CLI with URLs from the shared .env reader, so the
 * one local development database migrates as its owner and its application
 * role logs in with the local password (docs/DEVELOPMENT.md). Explicit
 * `MIGRATION_DATABASE_URL` and `DATABASE_URL` values, as CI sets, win.
 * Deployments run `src/cli/migrate.ts` directly with their own secrets.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { localEnvironment } from '../src/cli/local-environment.ts';

const cli = fileURLToPath(new URL('../src/cli/migrate.ts', import.meta.url));
const { status } = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  env: localEnvironment(),
  stdio: 'inherit',
});
process.exit(status ?? 1);
