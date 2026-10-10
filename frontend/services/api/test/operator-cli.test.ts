import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { operatorMain } from '../src/cli/operator.ts';
import { resetSequence, resetTarget } from '../src/cli/reset-sequence.ts';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const systemEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|USERPROFILE|LOCALAPPDATA|APPDATA|PROCESSOR_ARCHITECTURE|OS)$/iu.test(
      key,
    ),
  ),
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
    // A database failure names its SQLSTATE, never the server's message.
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
          join(root, 'frontend/services/api/src/cli/backfill-billing.ts'),
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
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 90000);

it.each([false, true])(
  'production wrapper keeps secrets off argv and restores the environment after child failure=%s',
  async (failure) => {
    const psQuote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    const script = `
$env:DATABASE_URL = 'original-database'
$env:DB_SSL_MODE = 'original-tls'
$env:ACCOUNT_MANAGER_OPERATOR_PASSWORD = 'original-operator'
function gcloud {
  $global:LASTEXITCODE = 0
  if ($args -contains 'describe') { return '{"networkInterfaces":[{"networkIP":"10.28.0.10"}]}' }
  if ($args -contains '--secret=citeladder-database-url') { return 'postgresql://fixture-user:fixture-database-password@10.28.0.10:5432/fixture' }
  if ($args -contains '--secret=citeladder-demo-password') { return 'fixture-private-operator' }
  throw 'Unexpected GCP operation'
}
function node {
  if ($args -contains 'fixture-private-operator' -or $args -notcontains '--platform') { throw 'Unsafe arguments' }
  if ($env:ACCOUNT_MANAGER_OPERATOR_PASSWORD -ne 'fixture-private-operator') { throw 'Missing operator secret' }
  if (([Uri]$env:DATABASE_URL).Host -ne '127.0.0.1') { throw 'Missing tunnel target' }
  $global:LASTEXITCODE = ${failure ? '1' : '0'}
}
try { & ${psQuote(join(root, 'scripts/provision-dev-login.ps1'))} -UseExistingTunnel }
catch { if (${failure ? '$false' : '$true'}) { throw }; Write-Output 'expected-child-failure' }
if ($env:DATABASE_URL -ne 'original-database' -or $env:DB_SSL_MODE -ne 'original-tls' -or $env:ACCOUNT_MANAGER_OPERATOR_PASSWORD -ne 'original-operator') { throw 'Environment not restored' }
Write-Output 'environment-restored'
`;
    const result = await execute('pwsh', ['-NoProfile', '-Command', script], {
      env: systemEnv,
      timeout: 30000,
    });
    expect(result.stdout).toContain('environment-restored');
    expect(result.stdout + result.stderr).not.toContain('fixture-private-operator');
    if (failure) expect(result.stdout).toContain('expected-child-failure');
  },
  // A cold PowerShell start alone can exceed the default 5 s on CI runners.
  30000,
);

it('reset passes one explicit target to both bounded stages and stops on a reset failure', async () => {
  const env = {
    APP_ENV: 'development',
    DATABASE_URL: 'postgresql://127.0.0.1/disposable',
    DEV_LOGIN_PASSWORD: 'fixture-password',
  };
  const executeReset = vi.fn(async () => {});
  await resetSequence(env, executeReset);
  expect(executeReset).toHaveBeenCalledTimes(2);
  const first = executeReset.mock.calls[0] as unknown as [
    string,
    string[],
    { env: Record<string, string>; timeout: number },
  ];
  const second = executeReset.mock.calls[1] as unknown as typeof first;
  expect(first[2].env).toEqual({ ...env, CITELADDER_DISABLE_DOTENV: '1' });
  expect(second[2].env).toEqual(first[2].env);
  expect(first[2].timeout).toBe(420000);
  expect(second[2].timeout).toBe(301000);
  const failure = vi.fn(async () => {
    throw new Error('reset failed');
  });
  await expect(resetSequence(env, failure)).rejects.toThrow('reset failed');
  expect(failure).toHaveBeenCalledTimes(1);
  const missing = vi.fn(async () => {});
  await expect(resetSequence({}, missing)).rejects.toThrow('explicit_reset_database_required');
  expect(missing).not.toHaveBeenCalled();
  await expect(
    resetSequence({ ...env, RESET_MIGRATION_TIMEOUT_SECONDS: '0' }, missing),
  ).rejects.toThrow('invalid_reset_timeout');
  await expect(resetSequence({ ...env, APP_ENV: 'production' }, missing)).rejects.toThrow(
    "APP_ENV is 'production'",
  );
  expect(missing).not.toHaveBeenCalled();
});

it('reset drops only a local development database unless the exact token confirms it', () => {
  const remote = 'postgresql://user:fixture-secret@shared.example.com:5432/dev?password=hidden';
  expect(
    resetTarget({
      APP_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pw@localhost:5432/dev',
    }),
  ).toMatchObject({ database: 'dev', adminUrl: 'postgresql://user:pw@localhost:5432/postgres' });
  expect(() => resetTarget({ APP_ENV: 'development', DATABASE_URL: remote })).toThrow(
    "target host is 'shared.example.com'",
  );
  expect(() => resetTarget({ DATABASE_URL: 'postgresql://user:pw@127.0.0.1/dev' })).toThrow(
    "APP_ENV is '(unset)'",
  );
  const refusal = (() => {
    try {
      resetTarget({ APP_ENV: 'production', DATABASE_URL: remote });
      return 'accepted';
    } catch (error) {
      return String(error);
    }
  })();
  expect(refusal).toContain('RESET_CONFIRM_DESTRUCTIVE=drop-and-recreate');
  expect(refusal).not.toMatch(/fixture-secret|hidden/u);
  expect(
    resetTarget({
      APP_ENV: 'production',
      DATABASE_URL: remote,
      RESET_CONFIRM_DESTRUCTIVE: 'drop-and-recreate',
    }).database,
  ).toBe('dev');
  for (const url of [
    'sqlite:///tmp/citeladder.db',
    'postgresql://user:pw@localhost:5432/postgres',
    'postgresql://user:pw@localhost:5432/',
  ])
    expect(() => resetTarget({ APP_ENV: 'development', DATABASE_URL: url })).toThrow();
});
