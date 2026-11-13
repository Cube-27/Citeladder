/**
 * The Trusted Types default policy the app's report-only policy runs against
 * (`APP_CONTENT_SECURITY_POLICY_REPORT_ONLY`). It passes the third-party
 * scripts the app loads on purpose and declines everything else, which the
 * browser then reports without blocking. Browsers without Trusted Types skip it.
 */
import { RAZORPAY_CHECKOUT_SCRIPT } from '@/lib/config/billing';
import { TURNSTILE_SCRIPT_URL } from '@/lib/config/turnstile';

type TrustedTypePolicyFactory = {
  createPolicy(name: 'default', rules: { createScriptURL(input: string): string | null }): unknown;
};

declare global {
  interface Window {
    trustedTypes?: TrustedTypePolicyFactory;
  }
}

const TRUSTED_SCRIPT_URLS: ReadonlySet<string> = new Set([
  RAZORPAY_CHECKOUT_SCRIPT,
  TURNSTILE_SCRIPT_URL,
]);

/** Whether a script URL is one the app loads on purpose; null asks the browser to report it. */
export function trustedScriptUrl(input: string): string | null {
  return TRUSTED_SCRIPT_URLS.has(input) ? input : null;
}

/** Installed once at application start, before anything assigns a script URL. */
export function installTrustedTypesPolicy(): void {
  try {
    window.trustedTypes?.createPolicy('default', { createScriptURL: trustedScriptUrl });
  } catch {
    // An extension may have created the default policy first; reporting is
    // never worth stopping the app from starting.
  }
}
