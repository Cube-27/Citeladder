'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { authApi } from '@/lib/api/auth';
import { billingApi, type SubscriptionCheckoutInput } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { CHECKOUT_POLL_ATTEMPTS, CHECKOUT_POLL_INTERVAL_MS } from '@/lib/config/billing';
import { checkoutAttempt, clearCheckoutAttempt } from './checkout-attempt';
import { startCheckoutFlow } from './checkout-flow';

/** Copy for a checkout that ended without a provider callback. */
const INCOMPLETE_CHECKOUT: Record<string, string | null> = {
  redirected: null,
  unsupported: 'Checkout is unavailable for this payment provider.',
  dismissed: 'Checkout closed. Retry to reopen the same subscription.',
};

export function useSubscriptionCheckout() {
  const queryClient = useQueryClient();
  const attempt = useRef<{ fingerprint: string; key: string; userId: string } | null>(null);
  const activationId = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);

  const refresh = async (signal?: AbortSignal) => {
    if (!activationId.current) return;
    let state;
    try {
      state = await billingApi.activation(activationId.current, { signal });
    } catch {
      setNotice('Payment status is unavailable. Please refresh again.');
      return;
    }
    if (state.status !== 'pending' && attempt.current) {
      clearCheckoutAttempt(attempt.current.userId);
      attempt.current = null;
    }
    if (state.status === 'activated') {
      setNotice('Payment verified. Your subscription is active.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    } else if (state.status !== 'pending') {
      setNotice(`Checkout ${state.status}. No new access was granted.`);
    } else setNotice('Payment verification pending. You can refresh status here.');
    return state;
  };

  const mutation = useMutation({
    mutationFn: async ({ input, key }: { input: SubscriptionCheckoutInput; key?: string }) => {
      const user = await authApi.me();
      const fingerprint = JSON.stringify([user.id, input]);
      if (attempt.current?.fingerprint !== fingerprint) {
        attempt.current = {
          fingerprint,
          key: checkoutAttempt(user.id, input, key),
          userId: user.id,
        };
      }
      const activation = await billingApi.createSubscription(input, attempt.current.key);
      activationId.current = activation.activation_id;
      const current = await refresh();
      if (!current) return activation;
      if (current.status !== 'pending') return current;
      const checkout = await billingApi.checkout(activation.activation_id);
      setTestMode(checkout.provider_mode === 'test');
      const outcome = await startCheckoutFlow(checkout, user.email, setNotice);
      if (outcome.kind !== 'callback') {
        // A redirect hands the browser to the provider and this tab is done;
        // the other two are settled non-outcomes the reader is told about.
        const message = INCOMPLETE_CHECKOUT[outcome.kind];
        if (message) setNotice(message);
        return activation;
      }
      setNotice('Payment verification pending');
      try {
        await billingApi.verifyCheckout(activation.activation_id, outcome.callback);
      } catch {
        setNotice('Payment verification is uncertain. Refresh status before retrying.');
        return activation;
      }
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        CHECKOUT_POLL_ATTEMPTS * CHECKOUT_POLL_INTERVAL_MS,
      );
      let settled = current;
      try {
        for (
          let index = 0;
          index < CHECKOUT_POLL_ATTEMPTS && !controller.signal.aborted;
          index += 1
        ) {
          const state = await refresh(controller.signal);
          if (state) settled = state;
          if (!state || state.status !== 'pending') break;
          await new Promise((resolve) => {
            setTimeout(resolve, CHECKOUT_POLL_INTERVAL_MS);
          });
        }
      } finally {
        clearTimeout(timeout);
      }
      return settled;
    },
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : 'Checkout could not complete. Please retry.',
      ),
  });
  return { ...mutation, notice, testMode, refresh, start: mutation.mutateAsync };
}
