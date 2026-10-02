import { ConfigError } from './config-error.ts';

const defaults = {
  budgetSeconds: 300,
  poolSize: 4,
  wakeTimeoutMs: 5000,
  laneConcurrency: 1,
  drainLockWaitMs: 15_000,
  drainLockPollMs: 250,
};

function integer(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  max: number,
) {
  const raw = env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (
    (raw !== undefined && !/^\d+$/u.test(raw)) ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > max
  )
    throw new ConfigError(`${name} must be an integer between 1 and ${max}`);
  return value;
}

export function executionSettings(env: Record<string, string | undefined>) {
  const runnerJob = env.CLOUD_RUN_RUNNER_JOB?.trim() || '';
  if (
    runnerJob &&
    !/^projects\/[a-z][a-z0-9-]*\/locations\/[a-z0-9-]+\/jobs\/[a-z][a-z0-9-]*$/u.test(runnerJob)
  )
    throw new ConfigError(
      'CLOUD_RUN_RUNNER_JOB must be projects/<project>/locations/<region>/jobs/<job>',
    );
  const originToken = env.CITELADDER_ORIGIN_TOKEN || '';
  const previousOriginToken = env.CITELADDER_ORIGIN_TOKEN_PREVIOUS || '';
  if (
    (originToken && originToken.length < 32) ||
    (previousOriginToken && (!originToken || previousOriginToken.length < 32))
  )
    throw new ConfigError(
      'Origin tokens must contain at least 32 characters; rotation requires a current token',
    );
  const protectOrigin = Boolean(env.K_SERVICE || runnerJob);
  if (protectOrigin && !originToken)
    throw new ConfigError('Cloud Run API requires CITELADDER_ORIGIN_TOKEN');
  return {
    runnerJob,
    protectOrigin,
    originToken,
    previousOriginToken,
    laneConcurrency: defaults.laneConcurrency,
    // How long a later execution waits for an active drain before leaving it the work.
    drainLockWaitMs: defaults.drainLockWaitMs,
    drainLockPollMs: defaults.drainLockPollMs,
    budgetSeconds: integer(env, 'RUNNER_BUDGET_SECONDS', defaults.budgetSeconds, 3600),
    poolSize: integer(env, 'RUNNER_DB_POOL_SIZE', defaults.poolSize, 4),
    wakeTimeoutMs: integer(env, 'RUNNER_WAKE_TIMEOUT_MS', defaults.wakeTimeoutMs, 30000),
  };
}

/** Tables whose API mutations can leave executable or recoverable work. */
export const executionTables = new Set([
  'analytics_tasks',
  'brand_discovery_tasks',
  'integration_sync_runs',
  'agent_runs',
  'audit_tasks',
  'site_crawl_tasks',
  'pending_activations',
  'billing_webhook_events',
  'billing_subscriptions',
]);
