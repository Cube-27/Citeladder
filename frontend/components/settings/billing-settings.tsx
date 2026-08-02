'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { CreditCard, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { UsageMeters } from '@/components/billing/usage-meters';
import { billingApi, createIdempotencyKey, type SelfServePlanKey } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import {
  catalogPlanByKey,
  checkoutSelection,
  formatMoney,
  headlinePrice,
} from '@/lib/billing/catalog';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

/**
 * Account plan orchestration. Usage rendering lives in `UsageMeters`.
 *
 * Country is REQUEST-OWNED: `/billing/profile` no longer exists, so the ISO
 * country is submitted with the checkout that uses it rather than stored and
 * edited separately. There is no free/paid branch left — a plan is whatever
 * the catalog and the resolved grants say it is.
 */
export function BillingSettings({ enabled = true }: Readonly<{ enabled?: boolean }>) {
  const queryClient = useQueryClient();
  const { entitlement, isLoading: entitlementLoading } = useEntitlement();
  const [country, setCountry] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const catalogQuery = useQuery({
    queryKey: queryKeys.billing.catalog(country || undefined),
    queryFn: ({ signal }) => billingApi.catalog(country || undefined, { signal }),
    enabled,
    // Typing a country changes the query key. Without this the cards blank out
    // and every checkout button re-disables on each keystroke while the
    // re-priced catalog loads; the previous catalog stays on screen instead.
    placeholderData: keepPreviousData,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });

  const checkoutMutation = useMutation({
    mutationFn: (catalogKey: SelfServePlanKey) =>
      // BYOK only: `credit_price` is null in this release, so a funded
      // selection cannot start a checkout the backend would refuse.
      billingApi.createSubscription(
        { catalog_key: catalogKey, credential_mode: 'byok', country_code: country },
        createIdempotencyKey(),
      ),
    onSuccess: async (activation) => {
      // A hosted checkout is only actionable while the URL is present.
      if (activation.checkout_url) {
        hardNavigate(activation.checkout_url);
        return;
      }
      await refresh();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => billingApi.cancelSubscription(),
    onSuccess: async () => {
      setCancelOpen(false);
      await refresh();
    },
  });

  if (!enabled || entitlementLoading) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const subscription = entitlement?.subscription ?? null;
  const catalog = catalogQuery.data ?? null;
  const currentPlan =
    subscription && catalog ? catalogPlanByKey(catalog, subscription.catalog_key) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            Your capabilities come from the grants your active subscription issued.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {entitlement === null ? (
            <Alert tone="warning">
              Your entitlement could not be resolved. No paid capability is active until it does.
            </Alert>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-foreground text-heading-sm">
                    {currentPlan?.name ?? subscription?.catalog_key ?? 'No active plan'}
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    {subscription
                      ? `Subscription: ${subscription.status.replaceAll('_', ' ')}`
                      : 'No active subscription'}
                  </p>
                </div>
                <Badge variant="status" value={subscription ? 'success' : 'info'}>
                  {subscription ? 'Active' : 'None'}
                </Badge>
              </div>
              {subscription?.current_period_end ? (
                <p className="text-secondary text-sm">
                  {subscription.cancel_at_period_end
                    ? 'Access scheduled to end'
                    : 'Current period ends'}{' '}
                  {new Date(subscription.current_period_end).toLocaleDateString('en-US', {
                    dateStyle: 'medium',
                    timeZone: 'UTC',
                  })}
                  .
                </p>
              ) : null}
              {subscription && !subscription.cancel_at_period_end ? (
                <Button
                  variant="secondary"
                  disabled={cancelMutation.isPending}
                  onClick={() => setCancelOpen(true)}
                >
                  {cancelMutation.isPending ? 'Scheduling cancellation…' : 'Cancel at period end'}
                </Button>
              ) : null}
              {cancelMutation.isError ? (
                <Alert tone="danger">{message(cancelMutation.error)}</Alert>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <UsageMeters enabled={enabled} />

      <Card>
        <CardHeader>
          <CardTitle>Change plan</CardTitle>
          <CardDescription>
            Prices are resolved by the server for your billing country. Audits run on your own
            provider keys, billed by those providers directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {catalogQuery.isError ? (
            <Alert tone="danger">
              Could not load the plan catalog. Check your connection and retry.
            </Alert>
          ) : catalogQuery.isLoading || !catalog ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <label className="grid gap-1.5 text-sm">
                <span className="text-secondary font-medium">Billing country</span>
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value.toUpperCase().slice(0, 2))}
                  placeholder="IN"
                  aria-describedby="billing-country-help"
                  className="border-border bg-background focus-ring h-10 rounded-sm border px-3 uppercase outline-none"
                />
                <span id="billing-country-help" className="text-muted text-xs">
                  Two-letter ISO code. The server resolves currency, tax and the exact amount from
                  it — the price is never submitted by this page.
                </span>
              </label>

              {catalog.plans.map((plan) => {
                const price = headlinePrice(plan, 'byok');
                const selection = checkoutSelection(plan, 'byok');
                return (
                  <div
                    key={plan.key}
                    className="border-border grid gap-2 rounded-sm border p-3"
                    data-tier={plan.key}
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-foreground font-medium">{plan.name}</span>
                      <span className="text-foreground text-sm">
                        {price.kind === 'price'
                          ? `${formatMoney(price.money, catalog.currency_minor_units)} / month`
                          : price.kind === 'contact'
                            ? 'Contact us'
                            : 'Not yet priced'}
                      </span>
                    </div>
                    {plan.contact_only ? (
                      <Button asChild variant="secondary">
                        <Link href={plan.contact_url ?? '/demo'}>
                          Contact sales <ExternalLink className="size-4" aria-hidden />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        disabled={
                          !selection.ok || country.length !== 2 || checkoutMutation.isPending
                        }
                        onClick={() =>
                          selection.ok && checkoutMutation.mutate(selection.catalog_key)
                        }
                      >
                        <CreditCard className="size-4" aria-hidden />
                        {checkoutMutation.isPending ? 'Opening checkout…' : `Choose ${plan.name}`}
                      </Button>
                    )}
                    {!selection.ok && !plan.contact_only && selection.reason ? (
                      <p className="text-muted text-xs">{selection.reason}</p>
                    ) : null}
                  </div>
                );
              })}
              {checkoutMutation.isError ? (
                <Alert tone="danger">{message(checkoutMutation.error)}</Alert>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          if (!cancelMutation.isPending) setCancelOpen(open);
        }}
        title="Cancel subscription"
        description="Cancellation takes effect at the end of the current billing period."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={cancelMutation.isPending}
              onClick={() => setCancelOpen(false)}
            >
              Keep plan
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? 'Scheduling cancellation…' : 'Cancel at period end'}
            </Button>
          </>
        }
      >
        <p className="text-secondary text-sm">
          Your current period runs to its end and no next bundle is issued. Completed audits and
          evidence are never deleted when a plan ends.
        </p>
        {cancelMutation.isError ? (
          <Alert tone="danger">{message(cancelMutation.error)}</Alert>
        ) : null}
      </Dialog>
    </div>
  );
}
