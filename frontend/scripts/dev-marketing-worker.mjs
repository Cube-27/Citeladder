import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const astro = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const wrangler = fileURLToPath(
  new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
);
const checkOutput = fileURLToPath(new URL('./check-marketing-worker-output.mjs', import.meta.url));
// Its own output, not apps/marketing/dist: `wrangler dev` holds its local state
// and served assets open under the config's directory, so sharing production's
// dist made every `pnpm build` or quality check fail while the dev server ran
// (on Windows as EBUSY, or Astro's rmdirSync `recursive` error on Node 26).
const outDir = 'apps/marketing/.dev/dist';
const env = {
  ...process.env,
  LOCAL_COMPOSE_BUILD: 'true',
  PUBLIC_WEBSITE_ORIGIN: 'http://127.0.0.1:3000',
  PUBLIC_APP_ORIGIN: 'http://127.0.0.1:3001',
};
const options = { cwd, env, stdio: 'inherit' };

// A second dev server would rebuild the output the first one is serving from,
// failing on locked files and leaving the running one with deleted assets.
// The lock covers the whole lifetime, including the build before Wrangler
// binds the port; the port probe also catches anything else on 3000.
const lockPath = fileURLToPath(new URL('../apps/marketing/.dev/dev.lock', import.meta.url));
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}
function acquireLock() {
  mkdirSync(fileURLToPath(new URL('../apps/marketing/.dev/', import.meta.url)), {
    recursive: true,
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(openSync(lockPath, 'wx'), String(process.pid));
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const holder = Number.parseInt(readFileSync(lockPath, 'utf8'), 10);
      if (Number.isInteger(holder) && processAlive(holder)) return false;
      unlinkSync(lockPath); // Left behind by a run that crashed.
    }
  }
  return false;
}
if (!acquireLock()) {
  console.error('Another marketing dev server is running: stop it first.');
  process.exit(1);
}
process.on('exit', () => {
  try {
    unlinkSync(lockPath);
  } catch {
    // Already gone.
  }
});

const port = 3000;
const portFree = await new Promise((resolve) => {
  const probe = createServer()
    .once('error', () => resolve(false))
    .once('listening', () => probe.close(() => resolve(true)))
    .listen(port, '127.0.0.1');
});
if (!portFree) {
  console.error(`Port ${port} is in use: stop the running marketing dev server first.`);
  process.exit(1);
}
const build = spawnSync(
  process.execPath,
  [astro, 'build', '--root', 'apps/marketing', '--outDir', '.dev/dist'],
  options,
);
if (build.status !== 0) process.exit(build.status ?? 1);
const checked = spawnSync(process.execPath, [checkOutput, outDir], options);
if (checked.status !== 0) process.exit(checked.status ?? 1);

const worker = spawn(
  process.execPath,
  [
    wrangler,
    'dev',
    '-c',
    `${outDir}/server/wrangler.json`,
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
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
// Let Wrangler shut down first, so the lock is released only once it exits.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => worker.kill(signal));
}
