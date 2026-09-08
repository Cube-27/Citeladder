/**
 * Commercial-surface configuration (invariant 1: no component-owned prices,
 * thresholds, or cadences).
 *
 * Checkout prices, limits, and availability come only from `GET /billing/catalog`.
 */

/**
 * BYOK is ON by default in this release because `base_price` is the only
 * measured, available price: funded inputs are deliberately unset, so
 * `credit_price` is null and funded checkout cannot start. Frozen §7.1's
 * "default OFF shows funded, BYOK animates downward" behaviour is deferred
 * until the funded catalog values are measured (PR3).
 */
export const PRICING_BYOK_DEFAULT_ON = true;

export const PROJECT_SLOTS_CAPABILITY = 'project_slots';
export const CONTENT_CREATION_CAPABILITY = 'content_creation';
export const GROWTH_AGENT_CAPABILITY = 'growth_agent';
export const PROJECT_DELETION_CAPABILITY = 'project_deletion';

/** Duration of the numeric price tween. Only real number-to-number changes animate. */
export const PRICING_PRICE_TWEEN_MS = 275;

/** The query parameter that mirrors BYOK selection into the URL. */
export const PRICING_BYOK_QUERY_PARAM = 'byok';

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
