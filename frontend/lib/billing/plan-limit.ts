import type { ApiErrorCode } from '@citeladder/contracts/error-codes';

/**
 * Refusals a bigger plan or a top-up can lift. Every notice for one of these
 * offers the way to billing, so a limit is never a dead end.
 */
const PLAN_LIMIT_CODES = new Set<string>([
  'occupancy_limit_exceeded',
  'capability_not_granted',
  'prompt_runs_exhausted',
  'ai_credits_exhausted',
  'site_health_fetches_exhausted',
  'api_access_not_in_plan',
  'api_key_limit_reached',
  'crawl_logs_not_in_plan',
  'fact_checking_not_in_plan',
] satisfies readonly ApiErrorCode[]);

export const PLANS_HREF = '/billing';

export function isPlanLimit(code: string | undefined): boolean {
  return code !== undefined && PLAN_LIMIT_CODES.has(code);
}
