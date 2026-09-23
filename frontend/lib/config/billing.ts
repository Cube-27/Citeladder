/**
 * Commercial-surface configuration (invariant 1: no component-owned prices,
 * thresholds, or cadences).
 *
 * Checkout prices, limits, and availability come only from `GET /billing/catalog`.
 */

export const PROJECT_SLOTS_CAPABILITY = 'project_slots';
/** Maximum wait for public pricing data before showing the unavailable state. */
export const PUBLIC_CATALOG_TIMEOUT_MS = 3_000;
export const CONTENT_CREATION_CAPABILITY = 'content_creation';
export const GROWTH_AGENT_CAPABILITY = 'growth_agent';
export const PROJECT_DELETION_CAPABILITY = 'project_deletion';

/** Set on return from auth when a captured pricing intent should be resumed. */
export const PRICING_RESUME_QUERY_PARAM = 'resumeActivation';

/** Where a captured pricing intent returns to after authentication. */
export const PRICING_RETURN_PATH = '/pricing';

/**
 * Fallback when a contact-only catalog plan has no `contact_url`. The local
 * `/demo` route is gone; sales intake lives on the parent company site.
 */
export const CONTACT_SALES_HREF = 'https://www.cube27.com/contact/';

/** Same-tab storage key for a captured (untrusted) pricing intent. */
export const PENDING_PRICING_INTENT_KEY = 'citeladder.pendingPricingIntent.v1';

/**
 * A captured intent older than this is stale: the catalog it was captured
 * against may have changed, so it is discarded rather than replayed.
 */
export const PENDING_PRICING_INTENT_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Usage-meter threshold bands. These apply ONLY to `limit_state: 'finite'`
 * rows with real numeric aggregates — an `unlimited` or `unknown` row has no
 * ratio and must never be coloured by one. A server-supplied status always
 * wins over these.
 */
export const USAGE_METER_WARNING_RATIO = 0.8;
export const USAGE_METER_CRITICAL_RATIO = 0.95;

export const RAZORPAY_CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
export const CHECKOUT_POLL_INTERVAL_MS = 2_000;
export const CHECKOUT_POLL_ATTEMPTS = 30;
export const CHECKOUT_SCRIPT_TIMEOUT_MS = 15_000;
