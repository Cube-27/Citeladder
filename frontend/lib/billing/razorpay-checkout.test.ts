import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRazorpay, openRazorpay } from './razorpay-checkout';
import { CHECKOUT_SCRIPT_TIMEOUT_MS } from '@/lib/config/billing';

afterEach(() => {
  delete window.Razorpay;
  vi.useRealTimers();
});

describe('subscription modal', () => {
  it('uses server subscription identity and signed-in email without a browser amount', async () => {
    let options: Record<string, unknown> = {};
    window.Razorpay = class {
      constructor(value: unknown) {
        options = value as Record<string, unknown>;
      }
      on() {}
      open() {
        (options.modal as { ondismiss: () => void }).ondismiss();
      }
    };
    const result = await openRazorpay(
      {
        activation_id: 'activation',
        provider_mode: 'test',
        key_id: 'rzp_test_fixture',
        subscription_id: 'sub_fixture',
        expires_at: '2099-01-01',
        quote: {},
      } as Parameters<typeof openRazorpay>[0],
      'payer@example.test',
    );
    expect(result).toBeNull();
    expect(options).toMatchObject({
      key: 'rzp_test_fixture',
      subscription_id: 'sub_fixture',
      prefill: { email: 'payer@example.test' },
    });
    expect(options).not.toHaveProperty('amount');
    expect(options).not.toHaveProperty('order_id');
  });

  it('fails on blocked script loading and permits a fresh attempt', async () => {
    vi.useFakeTimers();
    const promise = loadRazorpay();
    const rejection = expect(promise).rejects.toThrow('could not load');
    await vi.advanceTimersByTimeAsync(CHECKOUT_SCRIPT_TIMEOUT_MS);
    await rejection;
    expect(
      document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]'),
    ).toBeNull();
    const retry = loadRazorpay();
    const retried = expect(retry).rejects.toThrow('could not load');
    document.querySelector('script')?.dispatchEvent(new Event('error'));
    await retried;
  });
});

it('allows a payment retry to succeed inside the same open modal', async () => {
  const onFailure = vi.fn();
  const callback = {
    razorpay_payment_id: 'pay_fixture',
    razorpay_subscription_id: 'sub_fixture',
    razorpay_signature: '0'.repeat(64),
  };
  window.Razorpay = class {
    constructor(private options: ConstructorParameters<NonNullable<typeof window.Razorpay>>[0]) {}
    on(_event: 'payment.failed', handler: () => void) {
      handler();
    }
    open() {
      this.options.handler(callback);
    }
  };
  const result = await openRazorpay(
    {
      key_id: 'rzp_test_fixture',
      subscription_id: 'sub_fixture',
      provider_mode: 'test',
    } as Parameters<typeof openRazorpay>[0],
    'payer@example.com',
    onFailure,
  );
  expect(onFailure).toHaveBeenCalledWith(expect.stringContaining('Payment failed'));
  expect(result).toEqual(callback);
});
