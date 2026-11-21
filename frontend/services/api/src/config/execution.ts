import { ConfigError } from './config-error.ts';
import { resolveSpec, type SettingSource, type SettingSpec } from './settings.ts';

export const heartbeatFailureLimit = 2;
export const interactiveExecution = {
  admissionSeconds: 30,
  timeoutSeconds: 240,
  concurrency: 2,
};

export const interactiveCapacity = {
  slots: 6,
  retryAfterSeconds: 15,
  shutdownGraceMs: 8000,
};

export const runnerLanes = {
  idlePollMs: 5000,
};

export const handoverLeadMs = 180_000;
const runnerTailMs = 600_000;

const defaults = {
  drainLockWaitMs: 15_000,
  drainLockPollMs: 250,
};

const drainLockWaitMs = (handover: boolean) =>
  handover ? handoverLeadMs + runnerTailMs : defaults.drainLockWaitMs;

const integer = (
  name: string,
  value: number,
  maximum: number,
): SettingSpec & { default: number } => ({
  env: [name],
  type: 'int',
  default: value,
  minimum: 1,
  maximum,
});
const text = (name: string): SettingSpec & { default: string } => ({
  env: [name],
  type: 'str',
  default: '',
});

export const executionSpecs = {
  budget_seconds: integer('RUNNER_BUDGET_SECONDS', 600, 3600),
  pool_size: integer('RUNNER_DB_POOL_SIZE', 4, 4),
  wake_timeout_ms: integer('RUNNER_WAKE_TIMEOUT_MS', 5000, 30000),
  wake_min_interval_ms: integer('RUNNER_WAKE_MIN_INTERVAL_MS', 5000, 60000),
  runner_job: text('CLOUD_RUN_RUNNER_JOB'),
  handover: { env: ['RUNNER_HANDOVER'], type: 'bool', default: false },
  scheduler_invoker: text('SCHEDULER_TICK_INVOKER'),
  scheduler_audience: text('SCHEDULER_TICK_AUDIENCE'),
  scheduler_budget_seconds: integer('SCHEDULER_TICK_BUDGET_SECONDS', 20, 120),
  origin_token: text('CITELADDER_ORIGIN_TOKEN'),
  previous_origin_token: text('CITELADDER_ORIGIN_TOKEN_PREVIOUS'),
  cloud_run_service: text('K_SERVICE'),
  cloud_run_job: text('CLOUD_RUN_JOB'),
};

export function executionSettings(source: SettingSource) {
  const setting = <K extends keyof typeof executionSpecs>(name: K) =>
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
  const protectOrigin = !env.CLOUD_RUN_JOB && Boolean(env.K_SERVICE || runnerJob);
  if (protectOrigin && !originToken)
    throw new ConfigError('Cloud Run API requires CITELADDER_ORIGIN_TOKEN');
  const invoker = String(setting('scheduler_invoker')).trim();
  const audience = String(setting('scheduler_audience')).trim();
  if (Boolean(invoker) !== Boolean(audience))
    throw new ConfigError('Set SCHEDULER_TICK_INVOKER and SCHEDULER_TICK_AUDIENCE together');
  return {
    runnerJob,
    scheduledTick: invoker
      ? { invoker, audience, budgetSeconds: setting('scheduler_budget_seconds') }
      : null,
    protectOrigin,
    originToken,
    previousOriginToken,
    drainLockWaitMs: drainLockWaitMs(setting('handover') === true),
    drainLockPollMs: defaults.drainLockPollMs,
    budgetSeconds: setting('budget_seconds'),
    poolSize: setting('pool_size'),
    wakeTimeoutMs: setting('wake_timeout_ms'),
    wakeMinIntervalMs: setting('wake_min_interval_ms'),
  };
}

export const DRAIN_LOCK = 'citeladder-runner-drain';

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
