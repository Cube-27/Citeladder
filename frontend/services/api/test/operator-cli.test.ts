import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { operatorMain } from '../src/cli/operator.ts';
import { resetSequence } from '../src/cli/reset-sequence.ts';

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

it('native local configuration preserves dotenv precedence/disable and the wrapper keeps passwords on stdin', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'provision-config-'));
  const cli = join(directory, 'frontend/services/api/src/cli');
  await mkdir(cli, { recursive: true });
  await mkdir(join(directory, 'scripts'));
  await mkdir(join(directory, 'backend'));
  await copyFile(
    join(root, 'frontend/services/api/src/cli/local-environment.ts'),
    join(cli, 'local-environment.ts'),
  );
  await copyFile(
    join(root, 'scripts/provision-dev-login.ps1'),
    join(directory, 'scripts/provision-dev-login.ps1'),
  );
  await writeFile(join(directory, '.env'), 'DATABASE_URL=postgresql://root-fixture/one\n');
  await writeFile(
    join(directory, 'backend/.env'),
    'DATABASE_URL=postgresql://backend-fixture/two\n',
  );
  await writeFile(
    join(cli, 'probe.ts'),
    "import { localEnvironment } from './local-environment.ts'; console.log(localEnvironment().DATABASE_URL ?? 'missing');",
  );
  const probe = async (env: Record<string, string> = {}) =>
    (
      await execute(process.execPath, [join(cli, 'probe.ts')], { env: { ...systemEnv, ...env } })
    ).stdout.trim();
  const psQuote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const script = `
function node {
  if ($args -notcontains '--password-stdin' -or $args -contains 'fixture-local') { throw 'Unsafe password arguments' }
  if (@($input)[0] -ne 'fixture-local') { throw 'Missing password stdin' }
  Write-Output 'native-provision'
  $global:LASTEXITCODE = 0
}
$password = ConvertTo-SecureString 'fixture-local' -AsPlainText -Force
& ${psQuote(join(directory, 'scripts/provision-dev-login.ps1'))} -Email fixture@example.test -Password $password -CounterAllowance 100
`;
  try {
    expect(await probe()).toBe('postgresql://backend-fixture/two');
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
    expect(
      (
        await execute('pwsh', ['-NoProfile', '-Command', script], {
          env: systemEnv,
          timeout: 30000,
        })
      ).stdout.trim(),
    ).toBe('native-provision');
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 90000);

it('reset passes one explicit target to both bounded stages and stops on a reset failure', async () => {
  const env = {
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
});
