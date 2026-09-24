import { describe, expect, it } from 'vite-plus/test';

import { billingErrorMessage, billingReasonMessage } from './reason-copy';

describe('billing reason copy', () => {
  it('translates a known code and never prints an unknown one', () => {
    expect(billingReasonMessage('checkout_unavailable')).toBe(
      'Checkout is not available for this purchase yet.',
    );
    expect(billingReasonMessage('some_new_reason')).toBe('This purchase is unavailable.');
  });

  it('treats inherited object keys as unknown reasons, not copy', () => {
    expect(billingReasonMessage('__proto__')).toBe('__proto__');
    expect(billingReasonMessage('toString')).toBe('toString');
    expect(billingErrorMessage(new Error('constructor'), 'Unavailable.')).toBe('constructor');
  });
});
