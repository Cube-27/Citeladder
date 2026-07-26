'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CreditCard, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { billingApi } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { useProjectContext } from '@/lib/project/project-context';

function money(amountMinor: number, currency: 'INR' | 'USD') {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
  }).format(amountMinor / 100);
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function BillingSettings({ enabled = true }: Readonly<{ enabled?: boolean }>) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { activeProject } = useProjectContext();
  const [countryDraft, setCountryDraft] = useState('');
  const confirming = searchParams.get('checkout') === 'return';

  const summaryQuery = useQuery({
    queryKey: queryKeys.billing.me(),
    queryFn: ({ signal }) => billingApi.me({ signal }),
    enabled,
    refetchInterval: (query) =>
      confirming && query.state.data?.tier_key !== 'paid' ? 3_000 : false,
  });
  const country = countryDraft || summaryQuery.data?.billing_country || '';
  const catalogQuery = useQuery({
    queryKey: queryKeys.billing.catalog(country || undefined),
    queryFn: ({ signal }) => billingApi.catalog(country || undefined, { signal }),
    enabled,
  });
  const entitlementQuery = useQuery({
    queryKey: queryKeys.billing.entitlement(activeProject?.workspace_id ?? null),
    queryFn: ({ signal }) => billingApi.entitlement(activeProject!.workspace_id, { signal }),
    enabled: enabled && Boolean(activeProject?.workspace_id),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
  };
  const countryMutation = useMutation({
    mutationFn: () => billingApi.updateCountry(country.trim().toUpperCase()),
    onSuccess: refresh,
  });
  const checkoutMutation = useMutation({
    mutationFn: () => billingApi.checkout(globalThis.crypto.randomUUID()),
    onSuccess: ({ checkout_url }) => window.location.assign(checkout_url),
  });
  const cancelMutation = useMutation({
    mutationFn: () => billingApi.cancel(),
    onSuccess: refresh,
  });

  if (!enabled || summaryQuery.isLoading) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (summaryQuery.isError || !summaryQuery.data) {
    return <Alert tone="danger">Could not load billing. Check your connection and retry.</Alert>;
  }

  const summary = summaryQuery.data;
  const paidPlan = catalogQuery.data?.plans.find((plan) => plan.tier_key === 'paid');
  const price = paidPlan?.price;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {confirming ? (
        <Alert tone={summary.tier_key === 'paid' ? 'success' : 'info'}>
          {summary.tier_key === 'paid'
            ? 'Payment confirmed. Paid capabilities are active.'
            : 'Confirming payment with Razorpay. Access changes only after a verified webhook; this page will refresh automatically.'}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            The active workspace inherits its sponsor’s entitlement.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-foreground text-lg font-semibold capitalize">
                {entitlementQuery.data?.tier_key ?? summary.tier_key}
              </p>
              <p className="text-muted mt-1 text-xs">
                {summary.subscription_status
                  ? `Razorpay subscription: ${summary.subscription_status.replaceAll('_', ' ')}`
                  : 'No Razorpay subscription'}
              </p>
            </div>
            <Badge
              variant="status"
              value={
                (entitlementQuery.data?.tier_key ?? summary.tier_key) === 'paid'
                  ? 'success'
                  : 'info'
              }
            >
              {(entitlementQuery.data?.tier_key ?? summary.tier_key) === 'paid' ? 'Paid' : 'Free'}
            </Badge>
          </div>
          {summary.current_period_end ? (
            <p className="text-secondary text-sm">
              {summary.cancel_at_period_end ? 'Access scheduled to end' : 'Current period ends'}{' '}
              {new Date(summary.current_period_end).toLocaleDateString()}.
            </p>
          ) : null}
          {summary.subscription_status && !summary.cancel_at_period_end ? (
            <Button
              variant="secondary"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (window.confirm('Cancel Paid at the end of the current billing cycle?')) {
                  cancelMutation.mutate();
                }
              }}
            >
              {cancelMutation.isPending ? 'Scheduling cancellation…' : 'Cancel at period end'}
            </Button>
          ) : null}
          {cancelMutation.isError ? (
            <Alert tone="danger">{message(cancelMutation.error)}</Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paid monthly</CardTitle>
          <CardDescription>
            India uses INR with GST added. Other supported countries use USD; your card issuer may
            convert the charge.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {price && price.total_amount_minor > 0 ? (
            <div>
              <p className="text-foreground text-2xl font-semibold">
                {money(price.base_amount_minor, price.currency)}
                <span className="text-muted ml-1 text-sm font-normal">/ month</span>
              </p>
              {price.tax_label ? (
                <p className="text-muted mt-1 text-xs">
                  {price.tax_label}; checkout total{' '}
                  {money(price.total_amount_minor, price.currency)}.
                </p>
              ) : null}
            </div>
          ) : (
            <Alert tone="info">
              The INR catalog amount will appear after the approved USD/INR provisioning rate is
              configured. The published international anchor remains $49/month before tax.
            </Alert>
          )}

          <label className="grid gap-1.5 text-sm">
            <span className="text-secondary font-medium">Billing country</span>
            <input
              value={country}
              onChange={(event) => setCountryDraft(event.target.value.toUpperCase().slice(0, 2))}
              placeholder="IN"
              aria-describedby="billing-country-help"
              className="border-border bg-background focus-ring h-10 rounded-md border px-3 uppercase outline-none"
            />
            <span id="billing-country-help" className="text-muted text-xs">
              Two-letter ISO code. This server-owned profile selects the fixed INR or USD plan; it
              cannot be overridden at checkout.
            </span>
          </label>
          <Button
            variant="secondary"
            disabled={country.length !== 2 || countryMutation.isPending}
            onClick={() => countryMutation.mutate()}
          >
            {countryMutation.isPending ? 'Saving…' : 'Save billing country'}
          </Button>
          {countryMutation.isError ? (
            <Alert tone="danger">{message(countryMutation.error)}</Alert>
          ) : null}

          {summary.tier_key === 'free' ? (
            <Button
              disabled={!summary.can_checkout || checkoutMutation.isPending}
              onClick={() => checkoutMutation.mutate()}
            >
              <CreditCard className="size-4" aria-hidden />
              {checkoutMutation.isPending ? 'Opening Razorpay…' : 'Upgrade with Razorpay'}
            </Button>
          ) : null}
          {!summary.can_checkout && summary.tier_key === 'free' ? (
            <Alert tone="info">
              {summary.checkout_block_reason === 'billing_country_required'
                ? 'Save your billing country to see the available checkout route.'
                : 'Live checkout is not enabled yet. Your Free plan remains active while Razorpay account approval and production configuration are completed.'}
            </Alert>
          ) : null}
          {checkoutMutation.isError ? (
            <Alert tone="danger">{message(checkoutMutation.error)}</Alert>
          ) : null}

          <Button asChild variant="secondary">
            <Link href="/demo">
              Enterprise options <ExternalLink className="size-4" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
