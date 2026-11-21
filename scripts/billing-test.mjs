import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACTIONS = ['up', 'down', 'tunnel', 'status', 'admin', 'plans', 'reconcile'];
const CLI = { admin: 'billing-admin.ts', plans: 'provision-razorpay-plans.ts' };
const ISOLATED = [
  'POSTGRES_PASSWORD',
  'POSTGRES_USER',
  'POSTGRES_DB',
  'DATABASE_URL',
  'COMPOSE_PROJECT_NAME',
  'CITELADDER_ENV_FILE',
  'CITELADDER_DISABLE_DOTENV',
];

export function checkSandboxEnvironment(values) {
  if (
    values.BILLING_RAZORPAY_MODE !== 'test' ||
    !values.BILLING_RAZORPAY_KEY_ID?.startsWith('rzp_test_')
  )
    throw new Error('Billing staging requires test mode and a test key.');
  if (
    values.POSTGRES_DB !== 'citeladder_billing_test' ||
    values.DEMO_MODE !== 'false' ||
    values.DEV_LOGIN_PASSWORD
  )
    throw new Error('Billing staging requires its isolated database and disabled bootstrap.');
  const escape = Object.entries(values).some(
    ([key, value]) =>
      (/^PROVIDER_PLATFORM_.*(API_KEY|CREDENTIAL_REF)$/u.test(key) ||
        key === 'BILLING_RAZORPAY_LIVE_READY') &&
      value &&
      value !== 'false',
  );
  if (escape)
    throw new Error('Live readiness and platform credential escape hatches must be disabled.');
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Billing staging command failed.');
}

function main(argv) {
  const [action = 'up', ...rest] = argv;
  if (!ACTIONS.includes(action))
    throw new Error(`Unknown action ${action}; use ${ACTIONS.join(', ')}.`);
  const envFlag = rest[0]?.startsWith('--env-file=')
    ? rest.shift().slice('--env-file='.length)
    : 'billing-test.env';
  const selected = resolve(root, envFlag);
  if (selected === join(root, '.env')) throw new Error('Use a dedicated billing-test environment.');
  const values = parseEnv(readFileSync(selected, 'utf8'));
  checkSandboxEnvironment(values);

  const env = { ...process.env };
  for (const name of [...ISOLATED, ...Object.keys(values)]) delete env[name];
  Object.assign(env, values, { CITELADDER_ENV_FILE: selected });
  const compose = ['compose', '--project-name', 'citeladder-billing-test', '--env-file', selected];
  compose.push('-f', 'docker-compose.yml', '-f', 'infra/compose.billing-test.yml');
  const options = { cwd: root, env };

  if (action === 'up') return run('docker', [...compose, 'up', '-d', '--build'], options);
  if (action === 'down') return run('docker', [...compose, 'down'], options);
  if (action === 'status') return run('docker', [...compose, 'ps'], options);
  if (action === 'tunnel')
    return run(
      'cloudflared',
      ['tunnel', '--url', 'http://127.0.0.1:8301', '--no-autoupdate'],
      options,
    );

  const user = encodeURIComponent(values.POSTGRES_USER || 'postgres');
  const password = encodeURIComponent(values.POSTGRES_PASSWORD ?? '');
  env.DATABASE_URL = `postgresql://${user}:${password}@127.0.0.1:55433/citeladder_billing_test`;
  env.CITELADDER_DISABLE_DOTENV = '1';
  if (action === 'reconcile')
    return run(process.execPath, ['src/runner.ts', ...rest], {
      ...options,
      cwd: join(root, 'frontend/services/api'),
    });
  return run(
    process.execPath,
    [join(root, 'frontend/services/api/src/cli', CLI[action]), ...rest],
    options,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
