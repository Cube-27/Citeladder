import { ConfigError } from './config-error.ts';
import { resolveSpec, type SettingSource, type SettingSpec } from './settings.ts';

export const heartbeatFailureLimit = 2;
/** Interactive POSTs borrow existing workers without waiting for a new job. */
export const interactiveExecution = {
  admissionSeconds: 30,
  timeoutSeconds: 240,
  concurrency: 2,
};

/**
 * In-request work one API instance runs at a time: interactive audits and
 * Agent turns together. A full instance answers 429 with `Retry-After`; the
 * queued work stays durable. On shutdown, open work is stopped and given
 * `shutdownGraceMs` to settle before the server closes.
 */
export const interactiveCapacity = {
  slots: 6,
  retryAfterSeconds: 15,
  shutdownGraceMs: 8000,
};

/** Runner lanes run concurrently; an idle lane is polled at most this far apart. */
export const runnerLanes = {
  idlePollMs: 5000,
};

const defaults = {
  drainLockWaitMs: 15_000,
  drainLockPollMs: 250,
};

const integer = (name: string, value: number, maximum: number): SettingSpec => ({
  env: [name],
  type: 'int',
  default: value,
  minimum: 1,
  maximum,
});
const text = (name: string): SettingSpec => ({ env: [name], type: 'str', default: '' });

/** The runner and Cloud Run execution settings, resolved like every other setting. */
export const executionSpecs = {
  // Each successor execution costs a one-to-three-minute Cloud Run cold start.
  budget_seconds: integer('RUNNER_BUDGET_SECONDS', 600, 3600),
  pool_size: integer('RUNNER_DB_POOL_SIZE', 4, 4),
  wake_timeout_ms: integer('RUNNER_WAKE_TIMEOUT_MS', 5000, 30000),
  wake_min_interval_ms: integer('RUNNER_WAKE_MIN_INTERVAL_MS', 5000, 60000),
  runner_job: text('CLOUD_RUN_RUNNER_JOB'),
  origin_token: text('CITELADDER_ORIGIN_TOKEN'),
  previous_origin_token: text('CITELADDER_ORIGIN_TOKEN_PREVIOUS'),
  // Cloud Run sets these: K_SERVICE on a service, CLOUD_RUN_JOB on a job execution.
  cloud_run_service: text('K_SERVICE'),
  cloud_run_job: text('CLOUD_RUN_JOB'),
};

export function executionSettings(source: SettingSource) {
  const setting = (name: keyof typeof executionSpecs) =>
    resolveSpec(name, executionSpecs[name], source);
  const value = (name: keyof typeof executionSpecs) => String(setting(name));
  const env = {
    CLOUD_RUN_RUNNER_JOB: value('runner_job'),
    CITELADDER_ORIGIN_TOKEN: value('origin_token'),
    CITELADDER_ORIGIN_TOKEN_PREVIOUS: value('previous_origin_token'),
    CLOUD_RUN_JOB: value('cloud_run_job'),
    K_SERVICE: value('cloud_run_service'),
  };
  const runnerJob = env.CLOUD_RUN_RUNNER_JOB.trim();
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
  // A job execution (Cloud Run sets CLOUD_RUN_JOB) serves no HTTP; it holds the
  // runner job only to start its own successor.
  const protectOrigin = !env.CLOUD_RUN_JOB && Boolean(env.K_SERVICE || runnerJob);
  if (protectOrigin && !originToken)
    throw new ConfigError('Cloud Run API requires CITELADDER_ORIGIN_TOKEN');
  return {
    runnerJob,
    protectOrigin,
    originToken,
    previousOriginToken,
    // How long a later execution waits for an active drain before leaving it the work.
    drainLockWaitMs: defaults.drainLockWaitMs,
    drainLockPollMs: defaults.drainLockPollMs,
    budgetSeconds: setting('budget_seconds') as number,
    poolSize: setting('pool_size') as number,
    wakeTimeoutMs: setting('wake_timeout_ms') as number,
    wakeMinIntervalMs: setting('wake_min_interval_ms') as number,
  };
}

// hashtextextended(DRAIN_LOCK, 0): one drain per database at a time.
export const DRAIN_LOCK = 'citeladder-runner-drain';

/** Tables whose API mutations can leave executable or recoverable work. */
export const executionTables = new Set([
  'analytics_tasks',
  'brand_discovery_tasks',
  'integration_sync_runs',
  'audit_tasks',
  'site_crawl_tasks',
  'pending_activations',
  'billing_webhook_events',
  'billing_subscriptions',
]);
