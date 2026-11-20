import { useState } from 'react';

import { X } from 'lucide-react';

import { PlanCard, PlanCards } from '@/components/billing/plan-row';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Dialog } from '@/components/ui/dialog';
import { SettingsGroup } from '@/components/ui/setting-row';
import { textRole } from '@/components/ui/typography';
import type {
  BillingCatalog,
  BillingEntitlement,
  CatalogPlan,
  SelfServePlanKey,
} from '@/lib/api/billing';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import {
  formatMoney,
  isSelfServeKey,
  planChangeDirection,
  type PlanChangeDirection,
} from '@/lib/billing/catalog';
import { Notice } from '@/components/ui/notice';

export type PlanChangeControls = {
  /** Prepares the prorated upgrade quote for review; nothing is charged yet. */
  upgrade: (key: SelfServePlanKey) => void;
  downgrade: (key: SelfServePlanKey) => void;
  pending: boolean;
  downgradeError: unknown;
};

type Option = { plan: CatalogPlan; key: SelfServePlanKey; direction: PlanChangeDirection };

export function changeOptions(catalog: BillingCatalog, current: CatalogPlan): Option[] {
  return catalog.plans.flatMap((plan) => {
    const key = plan.key;
    const direction = planChangeDirection(current, plan);
    if (!plan.self_serve || plan.contact_only || !isSelfServeKey(key) || !direction) return [];
    return [{ plan, key, direction }];
  });
}

/**
 * Moving an existing subscription between self-serve plans.
 *
 * An upgrade starts immediately once its prorated charge is paid, so it goes
 * through the same quote review as any purchase. A downgrade costs nothing
 * and waits for the next renewal, so it is confirmed in place. One scheduled
 * change at a time: while one is pending, the others are held.
 */
export function PlanChanges({
  catalog,
  currentPlan,
  subscription,
  canManage,
  controls,
}: Readonly<{
  catalog: BillingCatalog;
  currentPlan: CatalogPlan;
  subscription: NonNullable<BillingEntitlement['subscription']>;
  canManage: boolean;
  controls: PlanChangeControls;
}>) {
  const [downgradeTo, setDowngradeTo] = useState<Option | null>(null);
  const options = changeOptions(catalog, currentPlan);
  const held =
    !canManage ||
    controls.pending ||
    subscription.cancel_at_period_end ||
    (subscription.scheduled_change !== null &&
      subscription.scheduled_change.state !== 'provider_rejected');
  if (options.length === 0) return null;
  const funded = subscription.credential_mode === 'funded';
  const checkoutOpen = (plan: CatalogPlan) =>
    funded ? plan.funded_checkout_available : plan.checkout_available;
  const monthly = (plan: CatalogPlan) => {
    const price = funded ? plan.funded_total_price : plan.base_price;
    return price ? `${formatMoney(price, catalog.currency_minor_units)} / month before tax` : null;
  };
  // The workspace's own plan stands in its catalogue place among the ones it can move to.
  const cards = catalog.plans.flatMap((plan): { plan: CatalogPlan; option: Option | null }[] => {
    if (plan.key === currentPlan.key) return [{ plan, option: null }];
    const option = options.find((candidate) => candidate.key === plan.key);
    return option ? [{ plan, option }] : [];
  });
  return (
    <SettingsGroup
      id="change-plan"
      title="Change plan"
      description="Upgrades are prorated and start once paid. Downgrades start at renewal, with no refund."
    >
      {controls.downgradeError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(controls.downgradeError, {
            action: 'schedule the downgrade',
          })}
        />
      ) : null}
      <PlanCards>
        {cards.map(({ plan, option }) => (
          <PlanCard
            key={plan.key}
            name={plan.name}
            price={monthly(plan)}
            current={option === null}
            controls={
              option ? (
                <ChangeButton
                  option={option}
                  held={held}
                  checkoutOpen={checkoutOpen(option.plan)}
                  controls={controls}
                  onDowngrade={setDowngradeTo}
                />
              ) : null
            }
          />
        ))}
      </PlanCards>
      {options.some((option) => option.direction === 'upgrade' && !checkoutOpen(option.plan)) ? (
        <p className={textRole('caption')}>Upgrades unavailable: checkout is closed.</p>
      ) : null}
      <Dialog
        open={downgradeTo !== null}
        onOpenChange={(open) => {
          if (!open) setDowngradeTo(null);
        }}
        title={downgradeTo ? `Downgrade to ${downgradeTo.plan.name}` : 'Downgrade'}
        footer={
          <>
            <Button variant="quiet" onClick={() => setDowngradeTo(null)}>
              <Icon icon={X} />
              Keep {currentPlan.name}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (downgradeTo) controls.downgrade(downgradeTo.key);
                setDowngradeTo(null);
              }}
            >
              Schedule downgrade
            </Button>
          </>
        }
      >
        <p className={textRole('body', 'text-ink-2')}>
          {currentPlan.name} continues to the end of this period. No refund.
        </p>
      </Dialog>
    </SettingsGroup>
  );
}

function ChangeButton({
  option,
  held,
  checkoutOpen,
  controls,
  onDowngrade,
}: Readonly<{
  option: Option;
  held: boolean;
  checkoutOpen: boolean;
  controls: PlanChangeControls;
  onDowngrade: (option: Option) => void;
}>) {
  if (option.direction === 'upgrade')
    return (
      <Button
        variant="secondary"
        disabled={held || !checkoutOpen}
        onClick={() => controls.upgrade(option.key)}
      >
        Upgrade to {option.plan.name}
      </Button>
    );
  return (
    <Button variant="secondary" disabled={held} onClick={() => onDowngrade(option)}>
      Downgrade to {option.plan.name}
    </Button>
  );
}
