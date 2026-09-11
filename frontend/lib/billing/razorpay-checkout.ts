import type { billingApi, CheckoutCallback } from '@/lib/api/billing';
import { CHECKOUT_SCRIPT_TIMEOUT_MS, RAZORPAY_CHECKOUT_SCRIPT } from '@/lib/config/billing';

type Checkout = Awaited<ReturnType<typeof billingApi.checkout>>;

/**
 * The adapter name the backend reports for this vendor's SDK flow.
 *
 * The shared flow dispatcher matches on this rather than on a provider name,
 * so the vendor SDK loader below stays the only place that knows Razorpay's
 * script URL, option names, or callback field names.
 */
export const RAZORPAY_SDK_NAME = 'razorpay-checkout';

/** Razorpay's own callback shape. It never leaves this module unwrapped. */
type RazorpayCallback = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

type Instance = { open: () => void; on: (event: 'payment.failed', callback: () => void) => void };
type Options = {
  key: string;
  subscription_id: string;
  name: string;
  prefill: { email: string };
  handler: (callback: RazorpayCallback) => void;
  modal: { ondismiss: () => void };
};
declare global {
  interface Window {
    Razorpay?: new (options: Options) => Instance;
  }
}

let loading: Promise<void> | null = null;

export async function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return;
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      loading = null;
      reject(new Error('Payment window could not load. Please retry.'));
    };
    const timeout = setTimeout(fail, CHECKOUT_SCRIPT_TIMEOUT_MS);
    script.src = RAZORPAY_CHECKOUT_SCRIPT;
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      if (!window.Razorpay) return fail();
      clearTimeout(timeout);
      resolve();
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Open Razorpay's checkout and return its callback in the NEUTRAL wrapper.
 *
 * `public_key` is a publishable key id and `reference` is the provider's own
 * id for the intent — both are public initialization fields the server chose.
 * The vendor field names go back to the server untouched inside `fields`,
 * where this vendor's adapter allowlists and verifies them.
 */
export async function openRazorpay(
  checkout: Checkout,
  email: string,
  onFailure: (message: string) => void = () => undefined,
): Promise<CheckoutCallback | null> {
  await loadRazorpay();
  const Constructor = window.Razorpay;
  if (!Constructor) throw new Error('Payment window is unavailable.');
  return new Promise((resolve) => {
    const modal = new Constructor({
      key: checkout.public_key,
      subscription_id: checkout.reference,
      name: checkout.provider_mode === 'test' ? 'CiteLadder — Test mode' : 'CiteLadder',
      prefill: { email },
      handler: (callback) => resolve({ fields: { ...callback } }),
      modal: { ondismiss: () => resolve(null) },
    });
    modal.on('payment.failed', () =>
      onFailure('Payment failed. You can retry in the payment window or close it.'),
    );
    modal.open();
  });
}
