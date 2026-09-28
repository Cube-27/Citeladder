import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/** Isolate the Python fixture process from dotenv and inherited provider secrets. */
export async function actionFixture<T>(...args: string[]): Promise<T> {
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
    [fileURLToPath(new URL('./action-fixture.py', import.meta.url)), ...args],
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
        JWT_SECRET_KEY: 'pr7b-test-jwt-key-not-a-real-secret-1234',
        ENCRYPTION_KEY: 'pr7b-test-encryption-key-not-a-real-secret',
        REFERRAL_HASH_SALT: 'pr7b-test-referral-salt-not-a-real-secret',
      },
    },
  );
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as T;
}

export type ActionSeed = {
  user_id: string;
  workspace_id: string;
  project_id: string;
  audit_id: string;
  crawl_id: string;
  prompt0_id: string;
  prompt1_id: string;
  metric_snapshot_id: string;
  actions: Record<string, string>;
  members: Record<string, string>;
};
