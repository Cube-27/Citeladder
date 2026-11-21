import { execFileSync, spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localEnvironment } from '../src/cli/local-environment.ts';
import { isInheritedCredential } from '../test/inherited-credentials.ts';

const apiRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const types = args.includes('--types');
const files = args.filter((arg) => arg !== '--types');

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

const gitArgs = ['-C', apiRoot, 'rev-parse', '--absolute-git-dir'];
const gitDir = execFileSync('git', gitArgs, { encoding: 'utf8' }).trim(); // NOSONAR
const log = join(gitDir, 'api-test.log');
const command = types ? ['db:types'] : ['exec', 'vitest', 'run', ...files];
const output = openSync(log, 'w');
let status: number | null;
try {
  const options = {
    cwd: apiRoot,
    env,
    stdio: ['ignore', output, output],
  } satisfies SpawnSyncOptions;
  status = spawnSync('pnpm', command, options).status; // NOSONAR
} finally {
  closeSync(output);
}
process.stdout.write(`${readFileSync(log, 'utf8').split(/\r?\n/u).slice(-40).join('\n')}\n`);
process.stdout.write(`exit ${status} (full log: ${log})\n`);
process.exit(status ?? 1);
