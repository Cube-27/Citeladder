export const API_BASE_URL = '/api/v1';

export const DEFAULT_API_REQUEST_TIMEOUT_MS = 30_000;
const MAX_API_REQUEST_TIMEOUT_MS = 2_147_483_647;

export function getApiRequestTimeoutMs(): number {
  const raw = process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS;
  if (!raw || !/^[1-9]\d*$/u.test(raw)) return DEFAULT_API_REQUEST_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed)
    ? Math.min(parsed, MAX_API_REQUEST_TIMEOUT_MS)
    : DEFAULT_API_REQUEST_TIMEOUT_MS;
}

export const DEFAULT_BOOTSTRAP_READ_TIMEOUT_MS = 8_000;

export function getBootstrapReadTimeoutMs(): number {
  const raw = process.env.NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS;
  if (!raw || !/^[1-9]\d*$/u.test(raw)) return DEFAULT_BOOTSTRAP_READ_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : DEFAULT_BOOTSTRAP_READ_TIMEOUT_MS;
}

/**
 * Commerce buyer-prompt generation performs one structured model call. Keep
 * its browser request alive for the backend model gateway's 180-second bound
 * plus response/persistence overhead instead of applying the ordinary
 * 30-second API limit.
 */
export const COMMERCE_BUYER_PROMPT_REQUEST_TIMEOUT_MS = 195_000;

/**
 * Staging a Shopify store import fetches its product pages first, bounded by
 * the API's 120-second storefront deadline; the browser waits for that plus
 * parsing and storage instead of the ordinary 30-second limit.
 */
export const COMMERCE_STORE_IMPORT_REQUEST_TIMEOUT_MS = 135_000;

export const PROMPT_GENERATION_REQUEST_TIMEOUT_MS = 240_000;

export const ONBOARDING_COMPLETION_REQUEST_TIMEOUT_MS = 60_000;
// Interactive research owns a 180-second server budget, plus response overhead.
export const ONBOARDING_RESEARCH_REQUEST_TIMEOUT_MS = 195_000;
// Interactive link analysis has a 180-second server bound plus settlement overhead.
export const SITE_HEALTH_EXECUTION_REQUEST_TIMEOUT_MS = 195_000;
export const INTERACTIVE_EXECUTION_REQUEST_TIMEOUT_MS = 255_000;

export const API_RETRY_BACKOFF_MS = 150;

export const QUERY_RETRY_DELAY_MS = 500;
export const QUERY_SERVER_ERROR_RETRIES = 1;
export const QUERY_NETWORK_ERROR_RETRIES = 2;

export const WORKSPACE_LOADING_STALL_MS = 8_000;

/**
 * How long a first-load placeholder hides its spinner so a wait short enough
 * to go unnoticed passes without one. The visual reveal is the mirrored
 * `citeladder-loading-appear` animation delay in globals.css; this constant
 * holds the accessible `status` announcement to the same beat.
 */
export const LOADING_INDICATOR_DELAY_MS = 300;

export const CLIENT_ERROR_REPORTS_PER_SESSION = 10;

export const INTERACTION_REPORT_SAMPLE_RATE = 0.1;
export const SLOW_INTERACTION_MS = 200;

export const RELEASE_META_NAME = 'citeladder-release';

export const EVIDENCE_LIMIT = 100;
export const TABLE_SEARCH_DEBOUNCE_MS = 300;

export const DEFAULT_REPETITIONS = 1;

export const ACTIVE_RUN_POLL_MS = 3_000;
export const SYNC_RUN_POLL_MS = 3_000;
export const BRAND_DISCOVERY_POLL_MS = 1_000;
export const SEARCH_INTELLIGENCE_RUN_POLL_MS = 5_000;
export const RANGE_TASK_POLL_MS = 1_500;
export const READINESS_POLL_MS = 15_000;
export const CRAWL_POLL_MS = 4_000;
export const CRAWL_VIEW_REFRESH_MS = 30_000;
export const PERCEPTION_PENDING_POLL_MS = 15_000;
