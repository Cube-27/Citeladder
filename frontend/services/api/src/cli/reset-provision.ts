import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localEnvironment } from './local-environment.ts';
import { operatorMain } from './operator.ts';
import { policy } from '../config.ts';

await operatorMain(async () => {
  const env = localEnvironment();
  if (
    !policy.development_env_names.includes(env.APP_ENV?.trim().toLowerCase() ?? '') ||
    !env.DEV_LOGIN_PASSWORD
  ) {
    console.log('Development login provisioning skipped.');
    return;
  }
  const timeout = Number(env.RESET_PROVISION_TIMEOUT_SECONDS || 300) * 1000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('invalid_provision_timeout');
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./provision-dev-login.ts', import.meta.url)),
        '--email',
        env.DEV_LOGIN_EMAIL || 'dev@citeladder.com',
        '--password-stdin',
        '--counter-allowance',
        env.DEV_LOGIN_COUNTER_ALLOWANCE || '200',
      ],
      { env, timeout, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true },
    );
    child.on('error', reject);
    child.stdin.on('error', () => undefined);
    child.stdin.end(env.DEV_LOGIN_PASSWORD + '\n');
    child.on('exit', resolve);
  });
  if (code !== 0) throw new Error('development_provision_failed');
});
