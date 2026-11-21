#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const READY_TIMEOUT_MS = 45_000;
const PROBE_INTERVAL_MS = 250;

const { values: options } = parseArgs({
  options: {
    'project-id': { type: 'string', default: 'project-setup-20260711' },
    zone: { type: 'string', default: 'us-central1-a' },
    'database-instance': { type: 'string', default: 'citeladder-db' },
    'database-secret': { type: 'string', default: 'citeladder-database-url' },
    actor: { type: 'string', default: 'dev@citeladder.com' },
    'local-port': { type: 'string', default: '15432' },
    'use-existing-tunnel': { type: 'boolean', default: false },
  },
});
// Each value becomes a gcloud or node argument; none may read as a flag.
const VALID = {
  'project-id': /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u,
  zone: /^[a-z]+-[a-z]+\d+-[a-z]$/u,
  'database-instance': /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u,
  'database-secret': /^\w[\w-]{0,254}$/u,
  actor: /^[^\s@-][^\s@]*@[^\s@]+$/u,
};
const invalid = Object.keys(VALID).find((name) => !VALID[name].test(options[name]));
const projectId = options['project-id'];
const zone = options.zone;
const instanceName = options['database-instance'];
const localPort = Number(options['local-port']);
const accountManager = fileURLToPath(
  new URL('../frontend/services/api/src/cli/account-manager.ts', import.meta.url),
);

class OperatorError extends Error {}
let stopTunnel = () => {};

function gcloudRead(args) {
  try {
    const read = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] };
    return execFileSync('gcloud', args, read).trim(); // NOSONAR: the operator's gcloud from PATH.
  } catch {
    throw new OperatorError('GCP access failed. Check your gcloud login and project permissions.');
  }
}

function portInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(true));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(false)));
  });
}

function portAccepts(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.setTimeout(PROBE_INTERVAL_MS);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function openTunnel(databasePort) {
  if (await portInUse(localPort)) {
    throw new OperatorError(
      `Port ${localPort} is already in use. Choose another --local-port or use your existing authenticated tunnel with --use-existing-tunnel.`,
    );
  }
  const target = [instanceName, `--project=${projectId}`, `--zone=${zone}`, '--tunnel-through-iap'];
  // Foreground authentication lets gcloud verify/cache the SSH host key in the user's terminal.
  const authenticate = ['compute', 'ssh', ...target, '--command=true'];
  const login = spawnSync('gcloud', authenticate, { stdio: 'inherit' }); // NOSONAR: the operator's gcloud from PATH.
  if (login.status !== 0) throw new OperatorError('Production SSH authentication failed.');
  const forward = [
    'compute',
    'ssh',
    ...target,
    '--quiet',
    '--command=sleep 86400',
    '--ssh-flag=-oBatchMode=yes',
    '--ssh-flag=-L',
    '--ssh-flag',
    `127.0.0.1:${localPort}:127.0.0.1:${databasePort}`,
  ];
  // Its own process group, so stopping it also stops the ssh child gcloud starts.
  const background = { stdio: ['ignore', 'ignore', 'pipe'], detached: true };
  const tunnel = spawn('gcloud', forward, background); // NOSONAR: the operator's gcloud from PATH.
  stopTunnel = () => {
    if (tunnel.exitCode !== null || tunnel.signalCode !== null) return;
    try {
      process.kill(-tunnel.pid, 'SIGTERM');
    } catch {}
  };
  let diagnostic = '';
  tunnel.stderr.setEncoding('utf8').on('data', (chunk) => (diagnostic += chunk));
  let exited = false;
  tunnel.once('exit', () => (exited = true));
  tunnel.once('error', () => (exited = true));
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) {
      if (diagnostic.trim()) process.stderr.write(`${diagnostic.trim()}\n`);
      throw new OperatorError(
        'The production database tunnel stopped. Check SSH/IAP permissions and host-key verification.',
      );
    }
    if (await portAccepts(localPort)) return; // NOSONAR -- one probe at a time, by design.
    await sleep(PROBE_INTERVAL_MS); // NOSONAR -- the probe interval.
  }
  throw new OperatorError('Production database tunnel did not become ready within 45 seconds.');
}

async function main() {
  if (invalid) throw new OperatorError(`--${invalid} is not a valid value.`);
  if (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535) {
    throw new OperatorError('--local-port must be an integer from 1024 to 65535.');
  }
  const instance = JSON.parse(
    gcloudRead([
      'compute',
      'instances',
      'describe',
      instanceName,
      `--project=${projectId}`,
      `--zone=${zone}`,
      '--format=json',
    ]),
  );
  const database = new URL(
    gcloudRead([
      'secrets',
      'versions',
      'access',
      'latest',
      `--secret=${options['database-secret']}`,
      `--project=${projectId}`,
    ]),
  );
  if (database.hostname !== instance.networkInterfaces?.[0]?.networkIP) {
    throw new OperatorError(
      'The database secret does not target the selected production database instance.',
    );
  }
  process.stdout.write(
    `Production: project ${projectId}, database ${instanceName}, operator ${options.actor}\n`,
  );
  try {
    if (!options['use-existing-tunnel']) await openTunnel(database.port || '5432');
    database.hostname = '127.0.0.1';
    database.port = String(localPort);
    const env = {
      ...process.env,
      DATABASE_URL: database.href,
      // Transport encryption is supplied by the authenticated IAP/SSH tunnel.
      DB_SSL_MODE: 'disable',
      CITELADDER_DISABLE_DOTENV: '1',
    };
    delete env.ACCOUNT_MANAGER_OPERATOR_PASSWORD;
    const manager = [accountManager, '--platform', '--actor', options.actor];
    const result = spawnSync('node', manager, { stdio: 'inherit', env }); // NOSONAR: the operator's node from PATH.
    if (result.status !== 0) {
      throw new OperatorError('Account management failed; no further operations were attempted.');
    }
  } finally {
    stopTunnel();
  }
}

// Ctrl+C reaches this process and the account manager, not the detached tunnel.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    stopTunnel();
    process.exit(1);
  });
}
try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof OperatorError ? error.message : 'Unexpected failure.'}\n`,
  );
  process.exitCode = 1;
}
