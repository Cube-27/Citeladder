import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const astro = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const wrangler = fileURLToPath(
  new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
);
const checkOutput = fileURLToPath(new URL('./check-marketing-worker-output.mjs', import.meta.url));
const env = {
  ...process.env,
  LOCAL_COMPOSE_BUILD: 'true',
  PUBLIC_WEBSITE_ORIGIN: 'http://127.0.0.1:3000',
  PUBLIC_APP_ORIGIN: 'http://127.0.0.1:3001',
};
const options = { cwd, env, stdio: 'inherit' };
const build = spawnSync(process.execPath, [astro, 'build', '--root', 'apps/marketing'], options);
if (build.status !== 0) process.exit(build.status ?? 1);
const checked = spawnSync(process.execPath, [checkOutput], options);
if (checked.status !== 0) process.exit(checked.status ?? 1);

const worker = spawn(
  process.execPath,
  [
    wrangler,
    'dev',
    '-c',
    'apps/marketing/dist/server/wrangler.json',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    '3000',
    '--var',
    'ORIGIN_UPSTREAM:https://127.0.0.1:9443',
    '--var',
    'ORIGIN_TOKEN:local-dev-only-token-32-characters',
    '--var',
    'LOCAL_WORKER_ORIGIN:true',
  ],
  options,
);
worker.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
worker.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
