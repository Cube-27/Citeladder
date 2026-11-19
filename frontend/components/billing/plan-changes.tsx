import { useState } from 'react';

import { X } from 'lucide-react';

import { AppGrid } from '@/components/ui/app-grid';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ControlRow } from '@/components/ui/control-row';
import { Dialog } from '@/components/ui/dialog';
import { Stack } from '@/components/ui/layout';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
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
  return (
    <Section id="change-plan" aria-labelledby="plan-changes-title">
      <SectionHeader>
        <SectionTitle id="plan-changes-title">Change plan</SectionTitle>
        <SectionDescription>
          Upgrades are prorated and start once paid. Downgrades start at renewal, with no refund.
        </SectionDescription>
      </SectionHeader>
      <Stack as={SectionContent} gap="compact">
        <AppGrid layout="slips">
          {options.map((option) => (
            <ControlRow
              key={option.key}
              controls={
                option.direction === 'upgrade' ? (
                  <Button
                    variant="secondary"
                    disabled={held || !option.plan.checkout_available}
                    onClick={() => controls.upgrade(option.key)}
                  >
                    Upgrade to {option.plan.name}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={held}
                    onClick={() => setDowngradeTo(option)}
                  >
                    Downgrade to {option.plan.name}
                  </Button>
                )
              }
            >
              <span className={textRole('body')}>{option.plan.name}</span>
              {option.plan.base_price ? (
                <span className={textRole('caption')}>
                  {formatMoney(option.plan.base_price, catalog.currency_minor_units)} / month before
                  tax
                </span>
              ) : null}
            </ControlRow>
          ))}
        </AppGrid>
        {options.some(
          (option) => option.direction === 'upgrade' && !option.plan.checkout_available,
        ) ? (
          <p className="type-caption">Upgrades unavailable: checkout is closed.</p>
        ) : null}
        {controls.downgradeError ? (
          <Notice
            kind="mutation"
            notice={mutationNoticeForError(controls.downgradeError, {
              action: 'schedule the downgrade',
            })}
          />
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
      </Stack>
    </Section>
  );
}
