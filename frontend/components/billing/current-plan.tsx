import { SubscriptionDetail } from '@/components/billing/billing-account-details';
import { Tag } from '@/components/ui/tag';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { textRole } from '@/components/ui/typography';
import type { BillingEntitlement, CatalogPlan } from '@/lib/api/billing';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import type { SubscriptionStatus } from '@citeladder/contracts/billing';
import { Notice } from '@/components/ui/notice';
import { SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';

/** Subscriptions a customer can still cancel; any other state has nothing left to cancel. */
const CANCELLABLE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
  'past_due',
]);

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
  Partial<Record<SubscriptionStatus, { tone: 'info' | 'warning' | 'negative'; text: string }>>
> = {
  pending: {
    tone: 'info',
    text: 'Payment being verified. The plan starts once it is confirmed.',
  },
  past_due: {
    tone: 'warning',
    text: 'Renewal payment failed. The payment provider will retry it.',
  },
  unpaid: {
    tone: 'negative',
    text: 'Renewal payment failed. Paid access has stopped.',
  },
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
      <Notice tone="warning">
        The payment provider rejected the change to {planName(change.catalog_key)}.
      </Notice>
    );
  }
  return (
    <Notice tone="info">
      {change.direction === 'downgrade' ? 'Downgrade' : 'Change'} to {planName(change.catalog_key)}{' '}
      on <DisplayTime value={change.effective_at} dateOnly />
    </Notice>
  );
}

/** What the workspace is on: the plan's row, its notices above it. */
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
  return (
    <SettingsGroup title="Current plan">
      <PlanNotices entitlement={entitlement} planName={planName} />
      <SettingRows>
        <SettingRow
          label={currentPlan?.name ?? subscription?.catalog_key ?? 'No active plan'}
          description={
            <SubscriptionDetail
              subscription={subscription}
              periodEnd={subscription?.current_period_end}
            />
          }
          action={
            <>
              {/* The kind of access is a classification, not a state: neutral. The
                  unresolved case is a fault, and the warning above says so. */}
              <Tag>{accessLabel(entitlement)}</Tag>
              {canManage && subscription?.resumable_until ? (
                <Button
                  variant="secondary"
                  disabled={cancellation.resuming}
                  onClick={cancellation.resume}
                >
                  {cancellation.resuming ? 'Resuming…' : 'Resume plan'}
                </Button>
              ) : null}
            </>
          }
        >
          <ResumeNotice subscription={subscription} cancellation={cancellation} />
        </SettingRow>
      </SettingRows>
    </SettingsGroup>
  );
}

/**
 * Scheduling a cancellation for a plan that renews: the page's one danger
 * action, so its own last group. Nothing to show once one is scheduled.
 */
export function CancelPlan({
  entitlement,
  canManage,
  cancellation,
}: Readonly<{
  entitlement: BillingEntitlement | null;
  canManage: boolean;
  cancellation: BillingCancellation;
}>) {
  const subscription = entitlement?.subscription ?? null;
  if (
    !canManage ||
    !subscription ||
    subscription.resumable_until ||
    subscription.cancel_at_period_end ||
    !CANCELLABLE_STATUSES.has(subscription.status)
  )
    return null;
  return (
    <SettingsGroup title="Cancel plan">
      <SettingRows>
        <SettingRow
          label="Cancel at period end"
          description="Access runs to the end of this period. No refund."
          action={
            <Button
              variant="danger"
              disabled={cancellation.pending}
              onClick={() => cancellation.setOpen(true)}
            >
              {cancellation.pending ? 'Scheduling cancellation…' : 'Cancel at period end'}
            </Button>
          }
        />
      </SettingRows>
      <CancelDialog cancellation={cancellation} />
    </SettingsGroup>
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
          Resumable until <DisplayTime value={subscription.resumable_until} dateOnly />
        </p>
      ) : null}
      {cancellation.resumeError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(cancellation.resumeError, { action: 'resume the plan' })}
          onRetry={cancellation.resume}
        />
      ) : null}
    </>
  );
}

/** An operator grant: beside a paid plan it speaks for the grant alone, never the plan. */
function OverrideNotice({ besidePlan }: Readonly<{ besidePlan: boolean }>) {
  return (
    <Notice tone="info">
      {besidePlan ? 'The operator override expires' : 'Expires'} with its grant, with no funded AI
      credits.
    </Notice>
  );
}

/** Everything the reader should know about the plan's state, most urgent first. */
function PlanNotices({
  entitlement,
  planName,
}: Readonly<{ entitlement: BillingEntitlement | null; planName: (key: string) => string }>) {
  const subscription = entitlement?.subscription ?? null;
  const notice = subscription ? STATUS_NOTICE[subscription.status] : undefined;
  const active = (kind: string) =>
    entitlement?.grants.some((grant) => grant.source_kind === kind && grant.revoked_at === null);
  const override = active('override');
  return (
    <>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {subscription ? <ScheduledChange subscription={subscription} planName={planName} /> : null}
      {override ? <OverrideNotice besidePlan={active('plan') === true} /> : null}
      {entitlement?.trial_grant ? (
        <Notice tone="info">
          Temporary access ends <DisplayTime value={entitlement.trial_grant.deadline} dateOnly />.
          Nothing renews.
        </Notice>
      ) : null}
      {entitlement === null ? (
        <Notice tone="warning">Entitlement unresolved. No paid capability is active.</Notice>
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
      footer={
        <>
          <Button
            variant="quiet"
            disabled={cancellation.pending}
            onClick={() => cancellation.setOpen(false)}
          >
            <Icon icon={X} />
            Keep plan
          </Button>
          <Button
            variant="danger-confirm"
            disabled={cancellation.pending}
            onClick={cancellation.confirm}
          >
            {cancellation.pending ? 'Scheduling cancellation…' : 'Cancel at period end'}
          </Button>
        </>
      }
    >
      <p className={textRole('body', 'text-ink-2')}>
        Access runs to the end of this period. No refund.
      </p>
      {cancellation.error ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(cancellation.error, {
            action: 'schedule the cancellation',
          })}
        />
      ) : null}
    </Dialog>
  );
}
