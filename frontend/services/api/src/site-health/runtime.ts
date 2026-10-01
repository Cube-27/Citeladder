import { policy, resolveSettingSpec } from '../config.ts';

export function siteWorkerSettings(env: Record<string, string | undefined> = process.env) {
  const spec = policy.site_health.settings;
  const number = (name: keyof typeof spec) => Number(resolveSettingSpec(spec[name], env));
  const lease = number('lease_ttl_seconds');
  const heartbeat = number('heartbeat_interval_seconds');
  if (heartbeat <= 0 || lease <= heartbeat)
    throw new Error('Site Health heartbeat must be shorter than its lease');
  return {
    lease,
    heartbeat,
    poll: number('poll_interval_seconds'),
    concurrency: Math.max(1, Math.min(number('worker_concurrency'), number('global_concurrency'))),
    maxAttempts: number('max_attempts'),
    retryBase: number('retry_base_delay_seconds'),
    retryMax: number('retry_max_delay_seconds'),
    retryJitter: number('retry_jitter_seconds'),
    conflictMax: number('db_conflict_max_requeues'),
    conflictBase: number('db_conflict_base_delay_seconds'),
    conflictJitter: number('db_conflict_jitter_seconds'),
  };
}
