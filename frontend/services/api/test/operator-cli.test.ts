import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, mkdir, copyFile, rm, chmod, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { expect, it, vi } from 'vitest';
import { operatorMain } from '../src/cli/operator.ts';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const systemEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => /^(PATH|TMPDIR)$/u.test(key)),
);
it('billing administration returns nonzero without echoing malformed secret-bearing input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'operator-redaction-'));
  const file = join(directory, 'malformed.json');
  await writeFile(file, '{"api_key":"fixture-sensitive-value", broken');
  try {
    await expect(
      execute(
        process.execPath,
        [
          join(root, 'frontend/services/api/src/cli/billing-admin.ts'),
          'catalog-validate',
          '--file',
          file,
        ],
        { cwd: directory, env: { ...systemEnv, CITELADDER_DISABLE_DOTENV: '1', APP_ENV: 'test' } },
      ),
    ).rejects.toMatchObject({ code: 1, stderr: 'SyntaxError\n' });
    await expect(
      execute(
        process.execPath,
        [
          join(root, 'frontend/services/api/src/cli/billing-admin.ts'),
          'catalog-validate',
          '--file',
          file,
        ],
        {
          cwd: root,
          env: { ...systemEnv, CITELADDER_DISABLE_DOTENV: '1', APP_ENV: 'test' },
        },
      ),
    ).rejects.toMatchObject({ code: 1, stderr: 'path_outside_workspace\n' });
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

it('reports actionable reviewed failures while withholding arbitrary error messages', async () => {
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
  const originalExitCode = process.exitCode;
  try {
    await operatorMain(async () => {
      throw new Error('catalog_idempotency_conflict');
    });
    expect(stderr).toHaveBeenLastCalledWith('catalog_idempotency_conflict');
    await operatorMain(async () => {
      throw new Error('fixture-sensitive-value');
    });
    expect(stderr).toHaveBeenLastCalledWith('Error');
    await operatorMain(async () => {
      throw Object.assign(new Error('password authentication failed for user "fixture"'), {
        code: '28P01',
      });
    });
    expect(stderr).toHaveBeenLastCalledWith('Error 28P01');
    expect(process.exitCode).toBe(1);
  } finally {
    process.exitCode = originalExitCode;
    stderr.mockRestore();
  }
});

it.each(['invalid', '0', '1.5'])(
  'rejects development allowance %s before opening a database',
  async (allowance) => {
    await expect(
      execute(
        process.execPath,
        [
          join(root, 'frontend/services/api/src/cli/provision-workspace-billing.ts'),
          '--development-allowance',
          allowance,
        ],
        {
          env: { ...systemEnv, CITELADDER_DISABLE_DOTENV: '1', APP_ENV: 'test' },
        },
      ),
    ).rejects.toMatchObject({ code: 1, stderr: 'invalid_development_allowance\n' });
  },
);

it('native local configuration preserves dotenv precedence and disable admission', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'provision-config-'));
  const cli = join(directory, 'frontend/services/api/src/cli');
  await mkdir(cli, { recursive: true });
  await copyFile(
    join(root, 'frontend/services/api/src/cli/local-environment.ts'),
    join(cli, 'local-environment.ts'),
  );
  await writeFile(join(directory, '.env'), 'DATABASE_URL=postgresql://root-fixture/one\n');
  await writeFile(
    join(cli, 'probe.ts'),
    "import { localEnvironment } from './local-environment.ts'; console.log(localEnvironment().DATABASE_URL ?? 'missing');",
  );
  const probe = async (env: Record<string, string> = {}) =>
    (
      await execute(process.execPath, [join(cli, 'probe.ts')], { env: { ...systemEnv, ...env } })
    ).stdout.trim();
  try {
    expect(await probe()).toBe('postgresql://root-fixture/one');
    expect(await probe({ DATABASE_URL: 'postgresql://process-fixture/three' })).toBe(
      'postgresql://process-fixture/three',
    );
    expect(await probe({ CITELADDER_DISABLE_DOTENV: '1' })).toBe('missing');
    expect(
      await probe({
        CITELADDER_DISABLE_DOTENV: '1',
        DATABASE_URL: 'postgresql://isolated-fixture/four',
      }),
    ).toBe('postgresql://isolated-fixture/four');
    await writeFile(
      join(cli, 'roles.ts'),
      "import { localEnvironment } from './local-environment.ts'; const env = localEnvironment(); console.log(`${env.DATABASE_URL} ${env.MIGRATION_DATABASE_URL}`);",
    );
    const roles = await execute(process.execPath, [join(cli, 'roles.ts')], {
      env: {
        ...systemEnv,
        CITELADDER_DISABLE_DOTENV: '1',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'local p@ss',
        POSTGRES_DB: 'citeladder',
        POSTGRES_HOST: '127.0.0.1',
        POSTGRES_HOST_PORT: '55432',
      },
    });
    expect(roles.stdout.trim()).toBe(
      'postgresql://citeladder_app:local%20p%40ss@127.0.0.1:55432/citeladder postgresql://postgres:local%20p%40ss@127.0.0.1:55432/citeladder',
    );
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 90000);

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || !address) throw new Error('no port');
      server.close(() => resolve(address.port));
    });
  });

const GCLOUD_STUB = `
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.STUB_CALLS, JSON.stringify(args) + '\\n');
if (args.includes('describe')) console.log(JSON.stringify({ networkInterfaces: [{ networkIP: '10.28.0.10' }] }));
else if (args.includes('--secret=citeladder-database-url')) console.log(process.env.STUB_SECRET);
else if (args.includes('--command=true')) process.exit(0);
else if (args.includes('--command=sleep 86400')) {
  const port = Number(args.at(-1).split(':')[1]);
  require('node:net').createServer().listen(port, '127.0.0.1');
} else process.exit(9);
`;
const NODE_STUB = `
const { writeFileSync } = require('node:fs');
const { DATABASE_URL, DB_SSL_MODE, CITELADDER_DISABLE_DOTENV, ACCOUNT_MANAGER_OPERATOR_PASSWORD } = process.env;
writeFileSync(process.env.STUB_CHILD, JSON.stringify({ args: process.argv.slice(2).map((a) => a.split('/').at(-1)), DATABASE_URL, DB_SSL_MODE, CITELADDER_DISABLE_DOTENV, ACCOUNT_MANAGER_OPERATOR_PASSWORD: ACCOUNT_MANAGER_OPERATOR_PASSWORD ?? null }));
process.exit(Number(process.env.STUB_NODE_STATUS));
`;

it.each([
  { name: 'existing tunnel', tunnel: false, status: 0, host: '10.28.0.10', extra: [], refusal: '' },
  {
    name: 'existing tunnel, manager fails',
    tunnel: false,
    status: 1,
    host: '10.28.0.10',
    extra: [],
    refusal: '',
  },
  { name: 'opened tunnel', tunnel: true, status: 0, host: '10.28.0.10', extra: [], refusal: '' },
  {
    name: 'secret for another host',
    tunnel: false,
    status: 0,
    host: '10.28.0.99',
    extra: [],
    refusal: 'The database secret does not target the selected production database instance.\n',
  },
  {
    name: 'flag-shaped instance',
    tunnel: false,
    status: 0,
    host: '10.28.0.10',
    extra: ['--database-instance=--impersonate-service-account=fixture'],
    refusal: '--database-instance is not a valid value.\n',
  },
])(
  'production wrapper reads no operator password and keeps secrets off argv: $name',
  async ({ tunnel, status, host, extra, refusal }) => {
    const directory = await mkdtemp(join(tmpdir(), 'provision-login-'));
    const bin = join(directory, 'bin');
    await mkdir(bin);
    for (const [name, body] of Object.entries({ gcloud: GCLOUD_STUB, node: NODE_STUB })) {
      await writeFile(join(bin, name), `#!${process.execPath}\n${body}`);
      await chmod(join(bin, name), 0o755);
    }
    const port = await freePort();
    const calls = join(directory, 'calls.jsonl');
    const child = join(directory, 'child.json');
    const args = [
      '--local-port',
      String(port),
      ...(tunnel ? [] : ['--use-existing-tunnel']),
      ...extra,
    ];
    try {
      const result = await execute(
        process.execPath,
        [join(root, 'scripts/provision-dev-login.mjs'), ...args],
        {
          env: {
            ...systemEnv,
            PATH: `${bin}:${systemEnv.PATH}`,
            STUB_CALLS: calls,
            STUB_CHILD: child,
            STUB_NODE_STATUS: String(status),
            STUB_SECRET: `postgresql://fixture-user:fixture-database-password@${host}:5432/fixture`,
            DATABASE_URL: 'postgresql://inherited/database',
            ACCOUNT_MANAGER_OPERATOR_PASSWORD: 'inherited-operator',
          },
        },
      ).then(
        ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
        (error: { code: number; stdout: string; stderr: string }) => error,
      );
      expect(result.stdout + result.stderr).not.toContain('fixture-database-password');
      const gcloud = (await readFile(calls, 'utf8').catch(() => ''))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
      const ssh = gcloud
        .filter((call) => call[1] === 'ssh')
        .map((call) => call.find((arg) => arg.startsWith('--command=')));
      expect(ssh).toEqual(tunnel ? ['--command=true', '--command=sleep 86400'] : []);
      if (refusal) {
        expect(result).toMatchObject({ code: 1, stderr: refusal });
        expect(gcloud).toHaveLength(extra.length ? 0 : 2);
        await expect(readFile(child, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        return;
      }
      expect(JSON.parse(await readFile(child, 'utf8'))).toEqual({
        args: ['account-manager.ts', '--platform', '--actor', 'dev@citeladder.com'],
        DATABASE_URL: `postgresql://fixture-user:fixture-database-password@127.0.0.1:${port}/fixture`,
        DB_SSL_MODE: 'disable',
        CITELADDER_DISABLE_DOTENV: '1',
        ACCOUNT_MANAGER_OPERATOR_PASSWORD: null,
      });
      expect(result.code).toBe(status);
      if (status)
        expect(result.stderr).toBe(
          'Account management failed; no further operations were attempted.\n',
        );
      await new Promise<void>((resolve, reject) => {
        const server = createServer().once('error', reject);
        server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
