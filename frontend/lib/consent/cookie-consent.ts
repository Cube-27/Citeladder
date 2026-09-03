/**
 * Cookie consent state — the storage seam behind the banner.
 *
 * The Cookie Policy (`lib/marketing-content/legal.ts`) is the contract this
 * implements, not a description of it: non-essential analytics are "used only
 * with consent where required". So consent is OPT-IN. Undecided means not
 * granted, and nothing non-essential may run until the visitor accepts.
 *
 * Strictly necessary cookies are not modelled here. They are exempt, they run
 * regardless, and representing them as a stored `true` would invite a caller
 * to treat them as revocable when they are not.
 *
 * Kept apart from the banner component so the decision is readable without
 * mounting React: a future analytics loader asks `hasAnalyticsConsent()`
 * whether it may run, and the banner is only the UI that writes the answer.
 */

export const COOKIE_CONSENT_STORAGE_KEY = 'citeladder.cookie-consent';

/** The visitor's answer. Absent until they choose. */
export type ConsentDecision = 'accepted' | 'rejected';

function isDecision(value: string | null): value is ConsentDecision {
  return value === 'accepted' || value === 'rejected';
}

/**
 * The stored decision, or `null` when the visitor has not chosen yet.
 *
 * SSR-safe and failure-safe: on the server, in private mode, or against an
 * unrecognised value this answers `null`. `null` means "ask", never "assume
 * granted" — a storage failure must not silently enable analytics.
 */
export function readConsent(): ConsentDecision | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return isDecision(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeConsent(decision: ConsentDecision) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, decision);
  } catch {
    // Private mode or quota. The banner still closes for this page view; the
    // visitor is re-asked next time, which is the safe direction to fail.
  }
}

/**
 * Whether non-essential cookies may run right now.
 *
 * The single question any future analytics or marketing loader should ask.
 * Undecided answers `false`, so a tag added later cannot start firing on its
 * own before the visitor has accepted.
 */
export function hasAnalyticsConsent(): boolean {
  return readConsent() === 'accepted';
}
