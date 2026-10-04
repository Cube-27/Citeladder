import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { operatorMain } from '../src/cli/operator.ts';

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

it('local wrapper resolves dotenv once for both stages and honors process precedence and disable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'provision-config-'));
  const python = join(
    root,
    'backend/.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  await mkdir(join(directory, 'scripts'));
  await mkdir(join(directory, 'backend'));
  await copyFile(
    join(root, 'scripts/provision-dev-login.ps1'),
    join(directory, 'scripts/provision-dev-login.ps1'),
  );
  await copyFile(join(root, 'reset-db.py'), join(directory, 'reset-db.py'));
  await writeFile(join(directory, '.env'), 'DATABASE_URL=postgresql://root-fixture/one\n');
  await writeFile(
    join(directory, 'backend/.env'),
    'DATABASE_URL=postgresql://backend-fixture/two\n',
  );
  const psQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const script = `
function uv {
  if ($args[2] -eq '-c') { & ${psQuote(python)} @($args[2..($args.Length - 1)]); $global:LASTEXITCODE = $LASTEXITCODE; return }
  if ($args -notcontains '--password-stdin' -or $args -contains 'fixture-local') { throw 'Unsafe password arguments' }
  if (@($input)[0] -ne 'fixture-local') { throw 'Missing password stdin' }
  Write-Output ('identity=' + $env:DATABASE_URL)
  $global:LASTEXITCODE = 0
}
function node { Write-Output ('catalog=' + $env:DATABASE_URL); $global:LASTEXITCODE = 0 }
$password = ConvertTo-SecureString 'fixture-local' -AsPlainText -Force
& ${psQuote(join(directory, 'scripts/provision-dev-login.ps1'))} -Email fixture@example.test -Password $password -CounterAllowance 100
Write-Output ('restored=' + $env:DATABASE_URL)
`;
  try {
    const run = (env: Record<string, string> = {}) =>
      execute('pwsh', ['-NoProfile', '-Command', script], {
        env: { ...systemEnv, ...env },
        timeout: 30000,
      });
    expect((await run()).stdout.trim().split(/\r?\n/u)).toEqual([
      'identity=postgresql://backend-fixture/two',
      'catalog=postgresql://backend-fixture/two',
      'restored=',
    ]);
    expect(
      (await run({ DATABASE_URL: 'postgresql://process-fixture/three' })).stdout
        .trim()
        .split(/\r?\n/u),
    ).toEqual([
      'identity=postgresql://process-fixture/three',
      'catalog=postgresql://process-fixture/three',
      'restored=postgresql://process-fixture/three',
    ]);
    expect(
      (
        await run({
          CITELADDER_DISABLE_DOTENV: '1',
          DATABASE_URL: 'postgresql://isolated-fixture/four',
        })
      ).stdout
        .trim()
        .split(/\r?\n/u),
    ).toEqual([
      'identity=postgresql://isolated-fixture/four',
      'catalog=postgresql://isolated-fixture/four',
      'restored=postgresql://isolated-fixture/four',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 90000);
