import { describe, expect, it } from 'vite-plus/test';

import { ApiError } from '@/lib/api/errors';

import { billingErrorMessage, billingReasonMessage } from './reason-copy';

const refusal = (status: number, code: string | undefined, message: string) =>
  new ApiError(message, status, '{}', 'req-1', { code });

describe('billing reason copy', () => {
  it('words a read reason code and never prints an unknown one', () => {
    expect(billingReasonMessage('checkout_unavailable')).toBe('Checkout unavailable');
    expect(billingReasonMessage('funded_not_priced')).toBe('This purchase is unavailable.');
    expect(billingReasonMessage('__proto__')).toBe('This purchase is unavailable.');
  });

  it('shows the sentence a coded refusal carries', () => {
    const message = 'The GSTIN does not match the selected state. Check both and try again.';
    expect(
      billingErrorMessage(refusal(409, 'billing_gstin_state_mismatch', message), 'Unavailable.'),
    ).toBe(message);
    expect(
      billingErrorMessage(
        refusal(502, 'provider_rejected', 'The payment provider declined this plan change.'),
        'Unavailable.',
      ),
    ).toBe('The payment provider declined this plan change.');
  });

  it('uses the fallback when the failure carries no server sentence', () => {
    expect(
      billingErrorMessage(refusal(503, undefined, 'Service Unavailable'), 'Unavailable.'),
    ).toBe('Unavailable.');
    expect(
      billingErrorMessage(refusal(500, 'internal_error', 'An unexpected error occurred'), 'Retry.'),
    ).toBe('Retry.');
    expect(billingErrorMessage(refusal(0, 'request_timeout', 'Timed out'), 'Retry.')).toBe(
      'Retry.',
    );
  });

  it('shows a local checkout failure in its own words', () => {
    expect(billingErrorMessage(new Error('Sign in again before checkout.'), 'Retry.')).toBe(
      'Sign in again before checkout.',
    );
    expect(billingErrorMessage('not an error', 'Retry.')).toBe('Retry.');
  });
});
