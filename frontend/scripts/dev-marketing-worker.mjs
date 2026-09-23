import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env,
  LOCAL_COMPOSE_BUILD: 'true',
  PUBLIC_WEBSITE_ORIGIN: 'http://127.0.0.1:3000',
  PUBLIC_APP_ORIGIN: 'http://127.0.0.1:3001',
};
const options = { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' };
const build = spawnSync('pnpm', ['build:marketing'], options);
if (build.status !== 0) process.exit(build.status ?? 1);

const worker = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
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
