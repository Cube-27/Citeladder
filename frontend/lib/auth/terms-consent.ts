/**
 * The Terms decision a visitor made on the sign-in screen, carried into the app.
 *
 * Sign-in happens before any workspace is resolved, while acceptance is
 * recorded per workspace against the revision the server publishes. The
 * sign-in form therefore captures the explicit, unticked-by-default decision
 * and the policy gate records it for the resolved workspace, instead of
 * stopping the reader on a second consent screen after they already agreed.
 *
 * Tab-scoped (`sessionStorage`) so it survives the full-page Google sign-in
 * round trip but not a new tab or browser session: a session that reaches the
 * app without this decision still gets the explicit review screen.
 */
const TERMS_CONSENT_STORAGE_KEY = 'citeladder.terms-consent';

export function recordSignInTermsConsent() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(TERMS_CONSENT_STORAGE_KEY, new Date().toISOString());
  } catch {
    // Storage unavailable: the policy gate falls back to its explicit screen.
  }
}

export function hasSignInTermsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.sessionStorage.getItem(TERMS_CONSENT_STORAGE_KEY));
  } catch {
    return false;
  }
}
