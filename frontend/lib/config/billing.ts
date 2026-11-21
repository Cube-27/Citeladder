export const PROJECT_SLOTS_CAPABILITY = 'project_slots';
export const PUBLIC_CATALOG_TIMEOUT_MS = 3_000;
export const PUBLIC_CATALOG_FRESH_SECONDS = 600;
export const PUBLIC_CATALOG_STALE_SECONDS = 7 * 24 * 60 * 60;
export const AGENT_CAPABILITY = 'agent';
export const PROJECT_DELETION_CAPABILITY = 'project_deletion';
export const TEAM_MEMBERS_CAPABILITY = 'team_members';

export const PRICING_RESUME_QUERY_PARAM = 'resumeActivation';

export const PRICING_RETURN_PATH = '/pricing';

export const CONTACT_SALES_HREF = '/contact';

export const PENDING_PRICING_INTENT_KEY = 'citeladder.pendingPricingIntent.v1';

export const PENDING_PRICING_INTENT_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Usage-meter threshold bands. These apply ONLY to `limit_state: 'finite'`
 * rows with real numeric aggregates — an `unlimited` or `unknown` row has no
 * ratio and must never be coloured by one. A server-supplied status always
 * wins over these.
 */
export const USAGE_METER_WARNING_RATIO = 0.8;
export const USAGE_METER_CRITICAL_RATIO = 1;

export const RAZORPAY_CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
export const CHECKOUT_POLL_INTERVAL_MS = 2_000;
export const CHECKOUT_POLL_ATTEMPTS = 30;
export const CHECKOUT_SCRIPT_TIMEOUT_MS = 15_000;
