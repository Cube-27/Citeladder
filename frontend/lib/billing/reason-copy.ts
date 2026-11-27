import { ApiError, humanizeApiError } from '@/lib/api/errors';
import { serverMessage } from '@/lib/api/mutation-notice';

const REASON_COPY: ReadonlyMap<string, string> = new Map([
  ['checkout_unavailable', 'Checkout unavailable'],
  ['contact_only', 'Contact sales to buy this plan.'],
  ['trial_unavailable', 'A trial is not available for this plan.'],
]);

export function billingReasonMessage(reason: string, fallback = 'This purchase is unavailable.') {
  return REASON_COPY.get(reason) ?? fallback;
}

export function billingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return serverMessage(error) ?? fallback;
  return humanizeApiError(error, fallback).message;
}
