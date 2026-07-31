/**
 * Frontend operational configuration.
 *
 * This is the single owner for tunable client limits, request bounds, polling
 * cadences, and the same-origin API base. Feature modules may re-export values
 * for backwards compatibility, but must not redefine them.
 */

// Same-origin API transport (invariant 12).
export const API_BASE_URL = '/api/v1';

/**
 * Bounded default fetch timeout (A3). Every API request attempt is wrapped in
 * `AbortSignal.timeout(...)`; an expiry surfaces as a retryable network-class
 * `ApiError` (`code: 'request_timeout'`). Env-overridable via
 * `NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS` (invariant 1); read lazily so tests and
 * Next.js environments can change it without re-importing this module.
 */
export const DEFAULT_API_REQUEST_TIMEOUT_MS = 30_000;

export function getApiRequestTimeoutMs(): number {
  const raw = process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_API_REQUEST_TIMEOUT_MS;
}

// Analytics and evidence request/display bounds.
export const REFERRALS_PAGE_SIZE = 50;
export const CORRELATION_MIN_SAMPLE = 8;
export const EVIDENCE_LIMIT = 100;

// Content request and list bounds.
export const CONTENT_PROMPT_MAX_LEN = 4_000;
export const CONTENT_LIST_DEFAULT_LIMIT = 50;

// Audit launch bounds.
export const MIN_REPETITIONS = 1;
export const MAX_REPETITIONS = 10;
export const DEFAULT_REPETITIONS = 1;

// Polling cadences and retry ceilings.
export const ACTIVE_RUN_POLL_MS = 3_000;
export const BILLING_CONFIRM_POLL_MS = 3_000;
export const BILLING_CONFIRM_MAX_POLLS = 20;
export const CONTENT_LIST_POLL_MS = 3_000;
export const CONTENT_DETAIL_POLL_MS = 2_000;
export const SYNC_RUN_POLL_MS = 3_000;
export const ATTRIBUTION_RECOMPUTE_POLL_MS = 3_000;
