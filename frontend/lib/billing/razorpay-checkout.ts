import type { billingApi, CheckoutCallback } from '@/lib/api/billing';
import { CHECKOUT_SCRIPT_TIMEOUT_MS, RAZORPAY_CHECKOUT_SCRIPT } from '@/lib/config/billing';

type Checkout = Awaited<ReturnType<typeof billingApi.checkout>>;
type Instance = { open: () => void; on: (event: 'payment.failed', callback: () => void) => void };
type Options = {
  key: string;
  subscription_id: string;
  name: string;
  prefill: { email: string };
  handler: (callback: CheckoutCallback) => void;
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
      key: checkout.key_id,
      subscription_id: checkout.subscription_id,
      name: checkout.provider_mode === 'test' ? 'CiteLadder — Test mode' : 'CiteLadder',
      prefill: { email },
      handler: resolve,
      modal: { ondismiss: () => resolve(null) },
    });
    modal.on('payment.failed', () =>
      onFailure('Payment failed. You can retry in the payment window or close it.'),
    );
    modal.open();
  });
}
