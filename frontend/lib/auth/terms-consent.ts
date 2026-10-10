import { useRef, useState } from 'react';

/**
 * The Terms decision a visitor made on the signup form, carried into the app.
 *
 * Signup happens before the person joins any workspace, while acceptance is
 * recorded per workspace against the revision the server publishes. The policy
 * gate records this decision for a workspace they then join, instead of
 * stopping them on a second consent screen after they already agreed.
 *
 * Tab-scoped (`sessionStorage`) so it survives the full-page Google round trip
 * but not a new tab or browser session: a session that reaches a workspace
 * without this decision gets the explicit review screen.
 */
const TERMS_CONSENT_STORAGE_KEY = 'citeladder.terms-consent';

export function recordSignupTermsConsent() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(TERMS_CONSENT_STORAGE_KEY, new Date().toISOString());
  } catch {
    // Storage unavailable: the policy gate falls back to its explicit screen.
  }
}

export function hasSignupTermsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.sessionStorage.getItem(TERMS_CONSENT_STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * An unticked, required Terms checkbox. `confirm()` answers whether it is
 * ticked and, when it is not, flags it and moves focus to it.
 */
export function useTermsConsent() {
  const [agreed, setAgreed] = useState(false);
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const onChange = (value: boolean) => {
    setAgreed(value);
    if (value) setMissing(false);
  };
  const confirm = () => {
    if (agreed) return true;
    setMissing(true);
    ref.current?.querySelector<HTMLElement>('button[role="checkbox"]')?.focus();
    return false;
  };
  return { field: { ref, agreed, missing, onChange }, confirm };
}
