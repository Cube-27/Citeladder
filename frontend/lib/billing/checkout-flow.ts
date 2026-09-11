import type { billingApi, CheckoutCallback } from '@/lib/api/billing';
import { hardNavigate } from '@/lib/navigation/hard-navigate';

import { openRazorpay, RAZORPAY_SDK_NAME } from './razorpay-checkout';

type Checkout = Awaited<ReturnType<typeof billingApi.checkout>>;

/** What the browser did with a checkout initialization. */
export type CheckoutOutcome =
  | { kind: 'callback'; callback: CheckoutCallback }
  | { kind: 'dismissed' }
  | { kind: 'redirected' }
  | { kind: 'unsupported' };

/**
 * The SHARED browser-checkout dispatcher (plan §3.4).
 *
 * It reads only the neutral initialization contract — a flow, an adapter name,
 * a publishable key and the provider's reference — and never a vendor field
 * name. Each vendor's SDK loader and callback shape stay inside that vendor's
 * module, so adding a provider is a new branch here plus its own module,
 * not a change to everything that touches checkout.
 *
 * A `hosted_redirect` provider gets a full-page navigation to the URL the
 * adapter already validated against its own allowlisted hosts; nothing here
 * invents, rewrites, or widens that URL.
 */
export async function startCheckoutFlow(
  checkout: Checkout,
  email: string,
  onFailure: (message: string) => void = () => undefined,
): Promise<CheckoutOutcome> {
  if (checkout.flow === 'hosted_redirect') {
    if (!checkout.redirect_url) return { kind: 'unsupported' };
    hardNavigate(checkout.redirect_url);
    return { kind: 'redirected' };
  }
  if (checkout.sdk_name !== RAZORPAY_SDK_NAME) return { kind: 'unsupported' };
  const callback = await openRazorpay(checkout, email, onFailure);
  return callback ? { kind: 'callback', callback } : { kind: 'dismissed' };
}
