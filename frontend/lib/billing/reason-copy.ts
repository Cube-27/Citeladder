import { ApiError } from '@/lib/api/errors';

/**
 * Reader copy for the billing API's stable reason codes.
 *
 * Billing refusals travel as snake_case codes (`checkout_unavailable`), which
 * the transport surfaces verbatim as the error message. Printing that on the
 * checkout page is what showed a machine code to buyers, so every billing
 * surface that shows a reason goes through here.
 */
const REASON_COPY: Readonly<Record<string, string>> = {
  checkout_unavailable: 'Checkout is not available for this purchase yet.',
  contact_only: 'Contact sales to buy this plan.',
  trial_unavailable: 'A trial is not available for this plan.',
  catalog_key_unknown: 'This item is no longer offered. Please select it again.',
  quantity_out_of_bounds: 'That quantity is not available for this item.',
  subscription_already_active: 'This workspace already has an active subscription.',
  subscription_pending: 'A subscription payment is already in progress. Refresh its status.',
  addon_pending: 'A payment for this add-on is already in progress. Refresh its status.',
  plan_change_pending: 'A plan change is already in progress. Refresh its status.',
  plan_change_same_plan: 'This workspace is already on that plan.',
  plan_change_unavailable: 'That plan change is not available.',
  no_current_subscription: 'This workspace has no active subscription.',
  base_subscription_required: 'Subscribe to a plan before buying this.',
  item_plan_ineligible: 'Your current plan cannot buy this item.',
  provider_unavailable: 'The payment provider is unavailable. Please try again shortly.',
  provider_rejected: 'The payment provider declined this checkout.',
  activation_expired: 'This checkout expired. Review the quote again.',
};

const REASON_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** Own-property lookup: an inherited key such as `__proto__` is not a reason. */
function reasonCopy(reason: string): string | undefined {
  return Object.hasOwn(REASON_COPY, reason) ? REASON_COPY[reason] : undefined;
}

/** Reader copy for one reason code; unknown codes never reach the screen raw. */
export function billingReasonMessage(reason: string, fallback = 'This purchase is unavailable.') {
  const copy = reasonCopy(reason);
  if (copy) return copy;
  return REASON_CODE.test(reason) ? fallback : reason;
}

/** A caught checkout error as reader copy, translating billing reason codes. */
export function billingErrorMessage(error: unknown, fallback: string): string {
  const coded = error instanceof ApiError && error.code ? reasonCopy(error.code) : undefined;
  if (coded) return coded;
  if (error instanceof Error && error.message.trim()) {
    return billingReasonMessage(error.message.trim(), fallback);
  }
  return fallback;
}
