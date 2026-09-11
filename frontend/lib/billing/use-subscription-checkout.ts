'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { authApi } from '@/lib/api/auth';
import { billingApi, type SubscriptionCheckoutInput } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { CHECKOUT_POLL_ATTEMPTS, CHECKOUT_POLL_INTERVAL_MS } from '@/lib/config/billing';
import { useActiveWorkspaceId } from '@/lib/project/project-context';
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
  // The workspace this purchase is FOR, captured when it starts. Everything
  // that follows names it explicitly, so a switch mid-flow cannot re-point the
  // purchase at another workspace's account.
  const activeWorkspaceId = useActiveWorkspaceId();
  const attempt = useRef<{
    fingerprint: string;
    key: string;
    userId: string;
    workspaceId: string;
  } | null>(null);
  const activationId = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);

  const refresh = async (signal?: AbortSignal) => {
    if (!activationId.current || !attempt.current) return;
    const workspaceId = attempt.current.workspaceId;
    let state;
    try {
      state = await billingApi.activation(activationId.current, { signal, workspaceId });
    } catch {
      setNotice('Payment status is unavailable. Please refresh again.');
      return;
    }
    if (state.status !== 'pending' && attempt.current) {
      clearCheckoutAttempt(attempt.current.userId, attempt.current.workspaceId);
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

  /**
   * Reuse this purchase's idempotency key, or mint one for a new purchase.
   *
   * The identity is (user, WORKSPACE, submitted input): the same person
   * buying the same plan for two workspaces is two purchases, and sharing a
   * key across them would replay the first activation into the second.
   */
  const beginAttempt = (
    userId: string,
    workspaceId: string,
    input: SubscriptionCheckoutInput,
    proposed?: string,
  ) => {
    const fingerprint = JSON.stringify([userId, workspaceId, input]);
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = {
        fingerprint,
        key: checkoutAttempt(userId, workspaceId, input, proposed),
        userId,
        workspaceId,
      };
    }
    return attempt.current;
  };

  const mutation = useMutation({
    mutationFn: async ({ input, key }: { input: SubscriptionCheckoutInput; key?: string }) => {
      const workspaceId = activeWorkspaceId;
      if (!workspaceId) throw new Error('Select a workspace before starting checkout.');
      const user = await authApi.me();
      const started = beginAttempt(user.id, workspaceId, input, key);
      const activation = await billingApi.createSubscription(input, started.key, {
        workspaceId,
      });
      activationId.current = activation.activation_id;
      const current = await refresh();
      if (!current) return activation;
      if (current.status !== 'pending') return current;
      const checkout = await billingApi.checkout(activation.activation_id, {
        workspaceId,
      });
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
        await billingApi.verifyCheckout(activation.activation_id, outcome.callback, {
          workspaceId,
        });
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
