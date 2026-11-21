import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { authApi } from '@/lib/api/auth';
import { billingApi, refreshAfterPurchase, type SelfServePlanKey } from '@/lib/api/billing';
import type { SubscriptionCheckoutRequest } from '@citeladder/contracts/billing-requests';
import { CHECKOUT_POLL_ATTEMPTS, CHECKOUT_POLL_INTERVAL_MS } from '@/lib/config/billing';
import { useOptionalProjectContext } from '@/lib/project/project-context';
import { checkoutAttempt, clearCheckoutAttempt } from './checkout-attempt';
import { startCheckoutFlow } from './checkout-flow';
import { billingErrorMessage } from './reason-copy';

const INCOMPLETE_CHECKOUT: Record<string, string | null> = {
  redirected: null,
  unsupported: 'Checkout is unavailable for this payment provider.',
  dismissed: 'Checkout closed. Retry to reopen the same payment.',
};

export type CheckoutPurchase =
  | { readonly kind: 'base'; readonly input: SubscriptionCheckoutRequest }
  | { readonly kind: 'addon'; readonly catalog_key: string; readonly quantity: number }
  | { readonly kind: 'topup'; readonly catalog_key: string; readonly quantity: number }
  | { readonly kind: 'upgrade'; readonly catalog_key: SelfServePlanKey };

type WorkspaceOptions = { workspaceId: string | null };

async function createIntent(purchase: CheckoutPurchase, key: string, options: WorkspaceOptions) {
  if (purchase.kind === 'base') return billingApi.createSubscription(purchase.input, key, options);
  if (purchase.kind === 'addon' || purchase.kind === 'topup') {
    const buy = purchase.kind === 'addon' ? billingApi.activateAddon : billingApi.purchaseTopup;
    return buy(purchase.catalog_key, purchase.quantity, key, options);
  }
  const change = await billingApi.changePlan(purchase.catalog_key, key, options);
  if (!change.activation) throw new Error('This plan change needs no payment.');
  return change.activation;
}

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
      setNotice(
        state.kind === 'base'
          ? 'Payment verified. Your subscription is active.'
          : 'Payment verified. Your purchase is active.',
      );
      await refreshAfterPurchase(queryClient, workspaceId);
    } else if (state.status !== 'pending') {
      setNotice(`Checkout ${state.status}. No new access was granted.`);
    } else setNotice('Payment verification pending. You can refresh status here.');
    return state;
  };

  const beginAttempt = (
    userId: string,
    workspaceId: string | null,
    input: CheckoutPurchase,
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
    purchase,
    key,
  }: {
    purchase: CheckoutPurchase;
    key?: string;
  }) => {
    const workspaceId = purchaseWorkspace(scope);
    const user = await authApi.me();
    const started = beginAttempt(user.id, workspaceId, purchase, key);
    const activation = await createIntent(purchase, started.key, { workspaceId });
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
        await /* NOSONAR -- Poll interval between activation checks. */ new Promise((resolve) => {
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
    onError: (error) => setNotice(billingErrorMessage(error, 'Quote unavailable.')),
  });
  const confirmMutation = useMutation({
    mutationFn: continueCheckout,
    onError: (error) => setNotice(billingErrorMessage(error, 'Checkout unavailable.')),
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
    mutationFn: async (input: { purchase: CheckoutPurchase; key?: string }) => {
      const activation = await prepareCheckout(input);
      if (activation.status !== 'pending') return (await refresh()) ?? activation;
      return (await continueCheckout()) ?? activation;
    },
    onError: (error) =>
      setNotice(billingErrorMessage(error, 'Checkout could not complete. Please retry.')),
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
