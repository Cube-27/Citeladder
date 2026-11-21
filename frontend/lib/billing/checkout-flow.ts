import type { billingApi } from '@/lib/api/billing';
import type { CheckoutVerifyRequest } from '@citeladder/contracts/billing-requests';

import { openRazorpay, RAZORPAY_SDK_NAME } from './razorpay-checkout';

type Checkout = Awaited<ReturnType<typeof billingApi.checkout>>;

export type CheckoutOutcome =
  | { kind: 'callback'; callback: CheckoutVerifyRequest }
  | { kind: 'dismissed' }
  | { kind: 'unsupported' };

export async function startCheckoutFlow(
  checkout: Checkout,
  email: string,
  onFailure: (message: string) => void = () => undefined,
): Promise<CheckoutOutcome> {
  if (checkout.sdk_name !== RAZORPAY_SDK_NAME) return { kind: 'unsupported' };
  const callback = await openRazorpay(checkout, email, onFailure);
  return callback ? { kind: 'callback', callback } : { kind: 'dismissed' };
}
