/**
 * Runs API tests, or regenerates the Kysely types with `--types`, against the
 * one local development database (docs/DEVELOPMENT.md). Pre-launch there are no
 * customers, so there are no per-branch copies. The URL comes from the shared
 * .env reader and the credentials the test guard refuses are dropped; nothing
 * secret is printed. Output goes to one reusable log in the Git directory.
 *
 *   pnpm test:api test/billing.test.ts      (from frontend/)
 *   pnpm test:api --types
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localEnvironment } from '../src/cli/local-environment.ts';
import { isInheritedCredential } from '../test/inherited-credentials.ts';

const apiRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const types = args.includes('--types');
const files = args.filter((arg) => arg !== '--types');

// Always the local POSTGRES_* database: an inherited URL could name a shared or
// remote one, and the suite writes and deletes rows. Code under test connects
// as the application role; fixtures and schema tests use the owner.
const local = localEnvironment({
  ...process.env,
  DATABASE_URL: undefined,
  MIGRATION_DATABASE_URL: undefined,
});
const appUrl = local.DATABASE_URL;
const ownerUrl = local.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl) throw new Error('Set POSTGRES_* in .env (see .env.example).');
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !isInheritedCredential(name)),
);
if (types) env.TYPES_DATABASE_URL = ownerUrl;
else Object.assign(env, { API_TEST_DATABASE_URL: appUrl, API_TEST_OWNER_DATABASE_URL: ownerUrl });

// Developer tooling runs git and pnpm from the caller's PATH, like quality.mjs.
const gitArgs = ['-C', apiRoot, 'rev-parse', '--absolute-git-dir'];
const gitDir = execFileSync('git', gitArgs, { encoding: 'utf8' }).trim(); // NOSONAR: trusted PATH.
const log = join(gitDir, 'api-test.log');
const command = types ? ['db:types'] : ['exec', 'vitest', 'run', ...files];
const output = openSync(log, 'w');
let status: number | null;
try {
  status = spawnSync('pnpm', command, {
    cwd: apiRoot,
    env,
    stdio: ['ignore', output, output],
  }).status; // NOSONAR: trusted PATH.
} finally {
  closeSync(output);
}
process.stdout.write(`${readFileSync(log, 'utf8').split(/\r?\n/u).slice(-40).join('\n')}\n`);
process.stdout.write(`exit ${status} (full log: ${log})\n`);
process.exit(status ?? 1);
