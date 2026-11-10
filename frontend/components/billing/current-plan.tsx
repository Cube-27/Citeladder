'use client';

import type { ReactNode } from 'react';

import { SubscriptionDetail } from '@/components/billing/billing-account-details';
import { Badge } from '@/components/ui/badge';
import { BillingPlan } from '@/components/ui/billing-plan';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { textRole } from '@/components/ui/typography';
import type { BillingEntitlement, CatalogPlan } from '@/lib/api/billing';
import { billingFailureNotice } from '@/lib/billing/reason-copy';

export type BillingCancellation = {
  open: boolean;
  setOpen: (open: boolean) => void;
  pending: boolean;
  error: unknown;
  confirm: () => void;
  /** Undo a scheduled cancellation while it is still held (B46). */
  resume: () => void;
  resuming: boolean;
  resumeError: unknown;
};

type Subscription = NonNullable<BillingEntitlement['subscription']>;

/**
 * What a non-active subscription state means for the reader's access. Each
 * line states only what the server's status already establishes; `null`
 * means the plan summary above says enough.
 */
const STATUS_NOTICE: Readonly<
  Record<string, { tone: 'info' | 'warning' | 'negative'; text: string }>
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
    tone: 'negative',
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
      <Callout tone="warning">
        The change to {planName(change.catalog_key)} was not accepted by the payment provider. Your
        current plan continues unchanged.
      </Callout>
    );
  }
  return (
    <Callout tone="info">
      {change.direction === 'downgrade' ? 'Downgrade' : 'Change'} to {planName(change.catalog_key)}{' '}
      scheduled for <DisplayTime value={change.effective_at} dateOnly />. Your current plan and its
      allowances continue until then.
    </Callout>
  );
}

export function CurrentPlan({
  entitlement,
  currentPlan,
  planName,
  canManage,
  cancellation,
  children,
}: Readonly<{
  entitlement: BillingEntitlement | null;
  currentPlan: CatalogPlan | null;
  planName: (key: string) => string;
  canManage: boolean;
  cancellation: BillingCancellation;
  /** What the workspace can do next with its plan (change, extras, a new plan), in this card. */
  children?: ReactNode;
}>) {
  const subscription = entitlement?.subscription ?? null;
  return (
    <BillingPlan
      label="Current plan"
      name={currentPlan?.name ?? subscription?.catalog_key ?? 'No active plan'}
      // The kind of access is a classification, not a state: neutral. The
      // unresolved case is a fault, and the warning below says so.
      badge={<Badge>{accessLabel(entitlement)}</Badge>}
      detail={
        <SubscriptionDetail
          subscription={subscription}
          periodEnd={subscription?.current_period_end}
        />
      }
      action={
        canManage && subscription ? (
          <CancellationControl subscription={subscription} cancellation={cancellation} />
        ) : null
      }
    >
      <PlanNotices entitlement={entitlement} planName={planName} />
      <ResumeNotice subscription={subscription} cancellation={cancellation} />
      <CancelDialog cancellation={cancellation} />
      {children}
    </BillingPlan>
  );
}

/** Resume a held cancellation, or schedule one for a plan that renews. */
function CancellationControl({
  subscription,
  cancellation,
}: Readonly<{ subscription: Subscription; cancellation: BillingCancellation }>) {
  if (subscription.resumable_until)
    return (
      <Button variant="secondary" disabled={cancellation.resuming} onClick={cancellation.resume}>
        {cancellation.resuming ? 'Resuming…' : 'Resume plan'}
      </Button>
    );
  if (
    subscription.cancel_at_period_end ||
    !['active', 'trialing', 'past_due'].includes(subscription.status)
  )
    return null;
  return (
    <Button
      variant="secondary"
      disabled={cancellation.pending}
      onClick={() => cancellation.setOpen(true)}
    >
      {cancellation.pending ? 'Scheduling cancellation…' : 'Cancel at period end'}
    </Button>
  );
}

/** How long a cancellation can still be undone, and why an undo failed. */
function ResumeNotice({
  subscription,
  cancellation,
}: Readonly<{ subscription: Subscription | null; cancellation: BillingCancellation }>) {
  return (
    <>
      {subscription?.resumable_until ? (
        <p className={textRole('caption')}>
          You can resume until <DisplayTime value={subscription.resumable_until} dateOnly />.
        </p>
      ) : null}
      {cancellation.resumeError ? (
        <MutationNotice
          notice={billingFailureNotice(cancellation.resumeError, 'resume the plan')}
          onRetry={cancellation.resume}
        />
      ) : null}
    </>
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
      {notice ? <Callout tone={notice.tone}>{notice.text}</Callout> : null}
      {subscription ? <ScheduledChange subscription={subscription} planName={planName} /> : null}
      {override ? (
        <Callout tone="info">
          Operator override applied. It is read-only here and expires according to the grant shown
          by the server; it does not imply a paid subscription or funded AI credits.
        </Callout>
      ) : null}
      {entitlement?.trial_grant ? (
        <Callout tone="info">
          Temporary access ends <DisplayTime value={entitlement.trial_grant.deadline} dateOnly />.
          No card is on file, nothing renews, and access returns to free at expiry.
        </Callout>
      ) : null}
      {entitlement === null ? (
        <Callout tone="warning">
          Your entitlement could not be resolved. No paid capability is active until it does.
        </Callout>
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
          <Button variant="danger" disabled={cancellation.pending} onClick={cancellation.confirm}>
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
        <MutationNotice
          notice={billingFailureNotice(cancellation.error, 'schedule the cancellation')}
        />
      ) : null}
    </Dialog>
  );
}
