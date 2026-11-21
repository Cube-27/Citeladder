import type { billingApi } from '@/lib/api/billing';
import type { CheckoutVerifyRequest } from '@citeladder/contracts/billing-requests';
import { CHECKOUT_SCRIPT_TIMEOUT_MS, RAZORPAY_CHECKOUT_SCRIPT } from '@/lib/config/billing';

type Checkout = Awaited<ReturnType<typeof billingApi.checkout>>;

export const RAZORPAY_SDK_NAME = 'razorpay-checkout';

type RazorpayCallback = {
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
};

type Instance = { open: () => void; on: (event: 'payment.failed', callback: () => void) => void };
type Options = {
  key: string;
  subscription_id?: string;
  order_id?: string;
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
      reject(new Error("Couldn't load the payment window. Please retry."));
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

function referenceOption(checkout: Checkout): Pick<Options, 'subscription_id' | 'order_id'> {
  return checkout.reference_kind === 'order'
    ? { order_id: checkout.reference }
    : { subscription_id: checkout.reference };
}

export async function openRazorpay(
  checkout: Checkout,
  email: string,
  onFailure: (message: string) => void = () => undefined,
): Promise<CheckoutVerifyRequest | null> {
  await loadRazorpay();
  const Constructor = window.Razorpay;
  if (!Constructor) throw new Error('Payment window is unavailable.');
  return new Promise((resolve) => {
    const modal = new Constructor({
      key: checkout.public_key,
      ...referenceOption(checkout),
      name: checkout.provider_mode === 'test' ? 'CiteLadder (test mode)' : 'CiteLadder',
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
