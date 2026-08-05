/** Polling controls for a page rerun before its first active snapshot appears. */
export const RERUN_POLL_INTERVAL_MS = 3_000;
export const RERUN_MAX_PRE_ACTIVE_POLLS = 10;

/** Coalescing window for non-progress Site Health lifecycle events. */
export const SITE_HEALTH_STREAM_INVALIDATE_DEBOUNCE_MS = 500;

/** Reconnect backoff bounds for the credentialed Site Health event stream. */
export const SITE_HEALTH_STREAM_RECONNECT_BASE_MS = 1_000;
export const SITE_HEALTH_STREAM_RECONNECT_MAX_MS = 15_000;
