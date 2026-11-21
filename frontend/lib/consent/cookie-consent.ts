export const COOKIE_CONSENT_STORAGE_KEY = 'citeladder.cookie-consent';

const consentListeners = new Set<() => void>();
let inMemoryDecision: ConsentDecision | null = null;

export type ConsentDecision = 'accepted' | 'rejected';

function isDecision(value: string | null): value is ConsentDecision {
  return value === 'accepted' || value === 'rejected';
}

export function readConsent(): ConsentDecision | null {
  if (typeof window === 'undefined') return null;
  if (inMemoryDecision !== null) return inMemoryDecision;
  try {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return isDecision(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeConsent(decision: ConsentDecision) {
  if (typeof window === 'undefined') return;
  inMemoryDecision = decision;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, decision);
    inMemoryDecision = null;
  } catch {
    // A failed rejection must not leave an older acceptance for the next load.
    if (decision === 'rejected') {
      try {
        window.localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
      } catch {}
    }
  }
  for (const listener of consentListeners) listener();
}

export function subscribeToConsent(onChange: () => void): () => void {
  consentListeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === COOKIE_CONSENT_STORAGE_KEY) {
      inMemoryDecision = null;
      onChange();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    consentListeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function hasAnalyticsConsent(): boolean {
  return readConsent() === 'accepted';
}
