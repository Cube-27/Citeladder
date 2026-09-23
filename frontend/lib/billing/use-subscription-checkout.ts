'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { authApi } from '@/lib/api/auth';
import { billingApi, type SubscriptionCheckoutInput } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { CHECKOUT_POLL_ATTEMPTS, CHECKOUT_POLL_INTERVAL_MS } from '@/lib/config/billing';
import { useOptionalProjectContext } from '@/lib/project/project-context';
import { checkoutAttempt, clearCheckoutAttempt } from './checkout-attempt';
import { startCheckoutFlow } from './checkout-flow';

/** Copy for a checkout that ended without a provider callback. */
const INCOMPLETE_CHECKOUT: Record<string, string | null> = {
  redirected: null,
  unsupported: 'Checkout is unavailable for this payment provider.',
  dismissed: 'Checkout closed. Retry to reopen the same subscription.',
};

/**
 * The workspace a purchase belongs to.
 *
 * Two hosts start checkouts and they differ in kind, not in degree. The
 * authenticated shell HAS a selection, so the purchase must name it and every
 * call in the flow carries it — a switch mid-flow then cannot re-point the
 * purchase at another workspace's account. The public pricing page has no
 * such selection to read: no `ProjectProvider` renders above it, and asking
 * for one would throw during the prerender of a page anonymous visitors are
 * served. It explicitly asks the server for the buyer's default workspace.
 *
 * `unscoped` therefore means "no selection exists here", never "the
 * selection has not arrived yet": a shell still resolving reports `pending`
 * and refuses to buy, rather than quietly charging the default workspace
 * while the reader is looking at another one.
 */
type CheckoutScope =
  | { readonly kind: 'scoped'; readonly workspaceId: string }
  | { readonly kind: 'unscoped' }
  | { readonly kind: 'pending' };

function useCheckoutScope(): CheckoutScope {
  const context = useOptionalProjectContext();
  if (!context) return { kind: 'unscoped' };
  const workspaceId = context.activeWorkspaceId;
  return workspaceId ? { kind: 'scoped', workspaceId } : { kind: 'pending' };
}

/**
 * The workspace this purchase is FOR, resolved ONCE when it starts.
 *
 * Every call in the flow then names this value explicitly, so nothing that
 * changes mid-flow — including a workspace switch in the shell — can re-point
 * the purchase at another account. `null` is the explicit "send no workspace
 * header" choice for the public pricing surface, which the server answers
 * with the buyer's default workspace.
 */
function purchaseWorkspace(scope: CheckoutScope): string | null {
  if (scope.kind === 'pending') throw new Error('Select a workspace before starting checkout.');
  return scope.kind === 'scoped' ? scope.workspaceId : null;
}

export function useSubscriptionCheckout() {
  const queryClient = useQueryClient();
  const scope = useCheckoutScope();
  const attempt = useRef<{
    fingerprint: string;
    key: string;
    userId: string;
    workspaceId: string | null;
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
    workspaceId: string | null,
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

  const prepareCheckout = async ({
    input,
    key,
  }: {
    input: SubscriptionCheckoutInput;
    key?: string;
  }) => {
    const workspaceId = purchaseWorkspace(scope);
    const user = await authApi.me();
    const started = beginAttempt(user.id, workspaceId, input, key);
    const activation = await billingApi.createSubscription(input, started.key, {
      workspaceId,
    });
    activationId.current = activation.activation_id;
    return activation;
  };

  const pollActivation = async (current: Awaited<ReturnType<typeof billingApi.activation>>) => {
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
        if (state?.status !== 'pending') break;
        await new Promise((resolve) => {
          setTimeout(resolve, CHECKOUT_POLL_INTERVAL_MS);
        });
      }
    } finally {
      clearTimeout(timeout);
    }
    return settled;
  };

  const continueCheckout = async () => {
    const started = attempt.current;
    const id = activationId.current;
    if (!started || !id || purchaseWorkspace(scope) !== started.workspaceId) {
      throw new Error('Review the quote again for the selected workspace.');
    }
    const user = await authApi.me();
    if (user.id !== started.userId) throw new Error('Sign in again before checkout.');
    const current = await refresh();
    if (!current) throw new Error('Payment status is unavailable. Refresh status before retrying.');
    if (current.status !== 'pending') return current;
    const workspaceId = started.workspaceId;
    const checkout = await billingApi.checkout(id, { workspaceId });
    setTestMode(checkout.provider_mode === 'test');
    const outcome = await startCheckoutFlow(checkout, user.email, setNotice);
    if (outcome.kind !== 'callback') {
      // A redirect hands the browser to the provider and this tab is done;
      // the other two are settled non-outcomes the reader is told about.
      const message = INCOMPLETE_CHECKOUT[outcome.kind];
      if (message) setNotice(message);
      return current;
    }
    setNotice('Payment verification pending');
    try {
      await billingApi.verifyCheckout(id, outcome.callback, {
        workspaceId,
      });
    } catch {
      setNotice('Payment verification is uncertain. Refresh status before retrying.');
      return current;
    }
    return pollActivation(current);
  };

  const prepareMutation = useMutation({
    mutationFn: prepareCheckout,
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Quote unavailable.'),
  });
  const confirmMutation = useMutation({
    mutationFn: continueCheckout,
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Checkout unavailable.'),
  });
  const prepareReset = prepareMutation.reset;
  const confirmReset = confirmMutation.reset;
  const resetPrepared = useCallback(() => {
    prepareReset();
    confirmReset();
    activationId.current = null;
    attempt.current = null;
  }, [prepareReset, confirmReset]);
  const mutation = useMutation({
    mutationFn: async (input: { input: SubscriptionCheckoutInput; key?: string }) => {
      const activation = await prepareCheckout(input);
      if (activation.status !== 'pending') return (await refresh()) ?? activation;
      return (await continueCheckout()) ?? activation;
    },
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : 'Checkout could not complete. Please retry.',
      ),
  });
  return {
    ...mutation,
    notice,
    testMode,
    refresh,
    start: mutation.mutateAsync,
    prepare: prepareMutation.mutateAsync,
    prepared: prepareMutation.data ?? null,
    preparing: prepareMutation.isPending,
    confirmPrepared: confirmMutation.mutateAsync,
    confirming: confirmMutation.isPending,
    resetPrepared,
  };
}
