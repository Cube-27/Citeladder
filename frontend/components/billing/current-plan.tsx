'use client';

import { SubscriptionDetail } from '@/components/billing/billing-account-details';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import type { BillingEntitlement, CatalogPlan } from '@/lib/api/billing';
import { humanizeApiError } from '@/lib/api/errors';

export type BillingCancellation = {
  open: boolean;
  setOpen: (open: boolean) => void;
  pending: boolean;
  error: unknown;
  confirm: () => void;
};

type Subscription = NonNullable<BillingEntitlement['subscription']>;

/**
 * What a non-active subscription state means for the reader's access. Each
 * line states only what the server's status already establishes; `null`
 * means the plan summary above says enough.
 */
const STATUS_NOTICE: Readonly<
  Record<string, { tone: 'info' | 'warning' | 'danger'; text: string }>
> = {
  pending: {
    tone: 'info',
    text: 'Payment is being verified. The plan starts once the payment is confirmed; nothing is granted before that.',
  },
  past_due: {
    tone: 'warning',
    text: 'The latest renewal payment did not go through. The payment provider will retry it. Contact billing help if it keeps failing.',
  },
  unpaid: {
    tone: 'danger',
    text: 'Renewal payment failed and paid access has stopped. Choose a plan again to restore it.',
  },
  cancelled: { tone: 'info', text: 'This subscription has ended.' },
  expired: { tone: 'info', text: 'This subscription has ended.' },
};

function accessLabel(entitlement: BillingEntitlement | null): string {
  if (!entitlement) return 'Unresolved';
  const active = entitlement.grants.filter((grant) => grant.revoked_at === null);
  if (entitlement.trial_grant) return 'Early access';
  if (active.some((grant) => grant.source_kind === 'override')) return 'Operator override';
  if (active.some((grant) => grant.source_kind === 'plan')) return 'Paid plan';
  return 'Free access';
}

function ScheduledChange({
  subscription,
  planName,
}: Readonly<{ subscription: Subscription; planName: (key: string) => string }>) {
  const change = subscription.scheduled_change;
  if (!change) return null;
  if (change.state === 'provider_rejected') {
    return (
      <Alert tone="warning">
        The change to {planName(change.catalog_key)} was not accepted by the payment provider. Your
        current plan continues unchanged.
      </Alert>
    );
  }
  return (
    <Alert tone="info">
      {change.direction === 'downgrade' ? 'Downgrade' : 'Change'} to {planName(change.catalog_key)}{' '}
      scheduled for <DisplayTime value={change.effective_at} dateOnly />. Your current plan and its
      allowances continue until then.
    </Alert>
  );
}

export function CurrentPlan({
  entitlement,
  currentPlan,
  planName,
  canManage,
  cancellation,
}: Readonly<{
  entitlement: BillingEntitlement | null;
  currentPlan: CatalogPlan | null;
  planName: (key: string) => string;
  canManage: boolean;
  cancellation: BillingCancellation;
}>) {
  const subscription = entitlement?.subscription ?? null;
  const cancellable =
    canManage &&
    subscription !== null &&
    !subscription.cancel_at_period_end &&
    ['active', 'trialing', 'past_due'].includes(subscription.status);
  return (
    <section className={panelClasses({}, 'grid gap-3')} aria-label="Current plan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className={eyebrowClasses}>Current plan</p>
          <div className="flex items-center gap-2.5">
            <p className={textRole('objectTitle')}>
              {currentPlan?.name ?? subscription?.catalog_key ?? 'No active plan'}
            </p>
            <Badge variant="status" value={entitlement ? 'success' : 'info'}>
              {accessLabel(entitlement)}
            </Badge>
          </div>
          <SubscriptionDetail
            subscription={subscription}
            periodEnd={subscription?.current_period_end}
          />
        </div>
        {cancellable ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={cancellation.pending}
            onClick={() => cancellation.setOpen(true)}
          >
            {cancellation.pending ? 'Scheduling cancellation…' : 'Cancel at period end'}
          </Button>
        ) : null}
      </div>
      <PlanNotices entitlement={entitlement} planName={planName} />
      {cancellation.error ? (
        <Alert tone="danger">{humanizeApiError(cancellation.error).message}</Alert>
      ) : null}
      <CancelDialog cancellation={cancellation} />
    </section>
  );
}

/** Everything the reader should know about the plan's state, most urgent first. */
function PlanNotices({
  entitlement,
  planName,
}: Readonly<{ entitlement: BillingEntitlement | null; planName: (key: string) => string }>) {
  const subscription = entitlement?.subscription ?? null;
  const notice = subscription ? STATUS_NOTICE[subscription.status] : undefined;
  const override = entitlement?.grants.some(
    (grant) => grant.source_kind === 'override' && grant.revoked_at === null,
  );
  return (
    <>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {subscription ? <ScheduledChange subscription={subscription} planName={planName} /> : null}
      {override ? (
        <Alert tone="info">
          Operator override applied. It is read-only here and expires according to the grant shown
          by the server; it does not imply a paid subscription or funded AI credits.
        </Alert>
      ) : null}
      {entitlement?.trial_grant ? (
        <Alert tone="info">
          Temporary access ends <DisplayTime value={entitlement.trial_grant.deadline} dateOnly />.
          No card is on file, nothing renews, and access returns to free at expiry.
        </Alert>
      ) : null}
      {entitlement === null ? (
        <Alert tone="warning">
          Your entitlement could not be resolved. No paid capability is active until it does.
        </Alert>
      ) : null}
    </>
  );
}

function CancelDialog({ cancellation }: Readonly<{ cancellation: BillingCancellation }>) {
  return (
    <Dialog
      open={cancellation.open}
      onOpenChange={(open) => {
        if (!cancellation.pending) cancellation.setOpen(open);
      }}
      title="Cancel subscription"
      description="Cancellation takes effect at the end of the current billing period."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={cancellation.pending}
            onClick={() => cancellation.setOpen(false)}
          >
            Keep plan
          </Button>
          <Button
            variant="destructive"
            disabled={cancellation.pending}
            onClick={cancellation.confirm}
          >
            {cancellation.pending ? 'Scheduling cancellation…' : 'Cancel at period end'}
          </Button>
        </>
      }
    >
      <p className={textRole('body')}>
        Your paid access runs to the end of the current period and the plan does not renew.
        Cancelling does not refund the rest of the period, and completed audits and evidence are not
        deleted when a plan ends.
      </p>
      {cancellation.error ? (
        <Alert tone="danger">{humanizeApiError(cancellation.error).message}</Alert>
      ) : null}
    </Dialog>
  );
}
