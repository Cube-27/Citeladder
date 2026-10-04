import { fileURLToPath } from 'node:url';

type Execute = (
  command: string,
  args: string[],
  options: { env: Record<string, string | undefined>; timeout: number; cwd: string },
) => Promise<unknown>;

/** Resolve once before destruction; a failed reset never reaches identity provisioning. */
export async function resetSequence(env: Record<string, string | undefined>, execute: Execute) {
  if (!env.DATABASE_URL?.trim()) throw new Error('explicit_reset_database_required');
  const root = fileURLToPath(new URL('../../../../../', import.meta.url));
  const timeout = Number(env.RESET_MIGRATION_TIMEOUT_SECONDS || 300) + 120;
  if (!Number.isFinite(timeout) || timeout <= 120) throw new Error('invalid_reset_timeout');
  const provisionTimeout = Number(env.RESET_PROVISION_TIMEOUT_SECONDS || 300);
  if (!Number.isFinite(provisionTimeout) || provisionTimeout <= 0)
    throw new Error('invalid_provision_timeout');
  const options = {
    env: { ...env, CITELADDER_DISABLE_DOTENV: '1' },
    timeout: timeout * 1000,
    cwd: root,
  };
  await execute(
    'uv',
    [
      'run',
      '--project',
      fileURLToPath(new URL('../../../../../backend', import.meta.url)),
      'python',
      fileURLToPath(new URL('../../../../../reset-db.py', import.meta.url)),
    ],
    options,
  );
  await execute(
    process.execPath,
    [fileURLToPath(new URL('./reset-provision.ts', import.meta.url))],
    { ...options, timeout: provisionTimeout * 1000 + 1000 },
  );
}
