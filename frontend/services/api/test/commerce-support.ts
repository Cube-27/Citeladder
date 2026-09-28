import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/** Only deterministic settings and the disposable database reach Python. */
export async function commerceIsland<T>(...args: string[]): Promise<T> {
  const backend = fileURLToPath(new URL('../../../../backend/', import.meta.url));
  const executable = fileURLToPath(
    new URL(
      process.platform === 'win32'
        ? '../../../../backend/.venv/Scripts/python.exe'
        : '../../../../backend/.venv/bin/python',
      import.meta.url,
    ),
  );
  const system = Object.fromEntries(
    ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME'].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : [],
    ),
  );
  const { stdout } = await promisify(execFile)(
    executable,
    [fileURLToPath(new URL('./commerce-island.py', import.meta.url)), ...args],
    {
      cwd: backend,
      env: {
        ...system,
        PYTHONPATH: backend,
        CITELADDER_DISABLE_DOTENV: '1',
        APP_ENV: 'test',
        DATABASE_URL: process.env.API_TEST_DATABASE_URL!.replace(
          'postgresql://',
          'postgresql+asyncpg://',
        ),
        JWT_SECRET_KEY: 'commerce-test-jwt-secret-not-a-real-secret',
        ENCRYPTION_KEY: 'commerce-test-encryption-not-a-real-secret',
        REFERRAL_HASH_SALT: 'commerce-test-referral-not-a-real-secret',
      },
    },
  );
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as T;
}
