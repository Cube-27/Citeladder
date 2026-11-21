import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { localEnvironment } from '../src/cli/local-environment.ts';

const cli = fileURLToPath(new URL('../src/cli/migrate.ts', import.meta.url));
const { status } = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  env: localEnvironment(),
  stdio: 'inherit',
});
process.exit(status ?? 1);
