import { SubscriptionDetail } from '@/components/billing/billing-account-details';
import { Tag } from '@/components/ui/tag';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { Text } from '@/components/ui/typography';
import type { BillingEntitlement, CatalogPlan } from '@/lib/api/billing';
import type { SubscriptionStatus } from '@citeladder/contracts/billing';
import { Notice } from '@/components/ui/notice';
import { SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';

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
  resume: () => void;
  resuming: boolean;
  resumeError: unknown;
};

type Subscription = NonNullable<BillingEntitlement['subscription']>;

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
  if (active.some((grant) => grant.source_kind === 'override')) return 'Complimentary plan';
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
    <SettingsGroup title="Cancel subscription">
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
              {cancellation.pending ? 'Scheduling cancellation…' : 'Cancel subscription'}
            </Button>
          }
        />
      </SettingRows>
      <CancelDialog cancellation={cancellation} periodEnd={subscription.current_period_end} />
    </SettingsGroup>
  );
}

function ResumeNotice({
  subscription,
  cancellation,
}: Readonly<{ subscription: Subscription | null; cancellation: BillingCancellation }>) {
  return (
    <>
      {subscription?.resumable_until ? (
        <Text as="p" variant="caption">
          Resumable until <DisplayTime value={subscription.resumable_until} dateOnly />
        </Text>
      ) : null}
      {cancellation.resumeError ? (
        <Notice
          kind="mutation"
          error={cancellation.resumeError}
          act={'resume the plan'}
          onRetry={cancellation.resume}
        />
      ) : null}
    </>
  );
}

function OverrideNotice({ besidePlan, endsAt }: Readonly<{ besidePlan: boolean; endsAt: string }>) {
  return (
    <Notice tone="info">
      {besidePlan ? 'Complimentary plan ends' : 'Ends'} <DisplayTime value={endsAt} dateOnly />
    </Notice>
  );
}

function overrideEnd(entitlement: BillingEntitlement | null): string | null {
  const ends = (entitlement?.grants ?? []).flatMap((grant) =>
    grant.source_kind === 'override' && grant.revoked_at === null && grant.effective_valid_until
      ? [grant.effective_valid_until]
      : [],
  );
  return ends.reduce<string | null>(
    (earliest, end) =>
      earliest === null || Date.parse(end) < Date.parse(earliest) ? end : earliest,
    null,
  );
}

function PlanNotices({
  entitlement,
  planName,
}: Readonly<{ entitlement: BillingEntitlement | null; planName: (key: string) => string }>) {
  const subscription = entitlement?.subscription ?? null;
  const notice = subscription ? STATUS_NOTICE[subscription.status] : undefined;
  const active = (kind: string) =>
    entitlement?.grants.some((grant) => grant.source_kind === kind && grant.revoked_at === null);
  const overrideEndsAt = overrideEnd(entitlement);
  return (
    <>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {subscription ? <ScheduledChange subscription={subscription} planName={planName} /> : null}
      {overrideEndsAt ? (
        <OverrideNotice besidePlan={active('plan') === true} endsAt={overrideEndsAt} />
      ) : null}
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

function CancelDialog({
  cancellation,
  periodEnd,
}: Readonly<{ cancellation: BillingCancellation; periodEnd: string | null }>) {
  return (
    <ConfirmDialog
      request={
        cancellation.open
          ? {
              question: 'Cancel subscription',
              body: 'Access runs to the end of this period. No refund.',
              confirmLabel: (
                <>
                  Cancel on <DisplayTime value={periodEnd} dateOnly fallback="period end" />
                </>
              ),
              destructive: true,
              onConfirm: cancellation.confirm,
            }
          : null
      }
      pending={cancellation.pending}
      onCancel={() => cancellation.setOpen(false)}
    >
      <Notice kind="mutation" error={cancellation.error} act={'schedule the cancellation'} />
    </ConfirmDialog>
  );
}
