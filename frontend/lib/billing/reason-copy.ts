import { ApiError, humanizeApiError } from '@/lib/api/errors';
import { serverMessage } from '@/lib/api/mutation-notice';

/**
 * Reader copy for the reason codes billing reads carry (`unavailable_reason`
 * on catalog plans and items). A failed billing call needs none: its envelope
 * `code` is the machine reason and its `message` is already a sentence
 * (docs/api-error-contract.md).
 */
const REASON_COPY: ReadonlyMap<string, string> = new Map([
  ['checkout_unavailable', 'Checkout is not available for this purchase yet.'],
  ['contact_only', 'Contact sales to buy this plan.'],
  ['trial_unavailable', 'A trial is not available for this plan.'],
]);

/** Reader copy for one read reason code; an unknown code never reaches the screen raw. */
export function billingReasonMessage(reason: string, fallback = 'This purchase is unavailable.') {
  return REASON_COPY.get(reason) ?? fallback;
}

/**
 * A caught checkout error as reader copy: the server's own sentence when the
 * failure carries one, a local failure's message, else `fallback`.
 */
export function billingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return serverMessage(error) ?? fallback;
  return humanizeApiError(error, fallback).message;
}
