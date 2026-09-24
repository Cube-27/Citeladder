'use client';

import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import type {
  BillingCatalog,
  BillingEntitlement,
  CatalogPlan,
  SelfServePlanKey,
} from '@/lib/api/billing';
import { humanizeApiError } from '@/lib/api/errors';
import {
  formatMoney,
  isSelfServeKey,
  planChangeDirection,
  type PlanChangeDirection,
} from '@/lib/billing/catalog';

export type PlanChangeControls = {
  /** Prepares the prorated upgrade quote for review; nothing is charged yet. */
  upgrade: (key: SelfServePlanKey) => void;
  downgrade: (key: SelfServePlanKey) => void;
  pending: boolean;
  downgradeError: unknown;
};

type Option = { plan: CatalogPlan; key: SelfServePlanKey; direction: PlanChangeDirection };

function changeOptions(catalog: BillingCatalog, current: CatalogPlan): Option[] {
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
    <section className={panelClasses({}, 'grid gap-3')} aria-labelledby="plan-changes-title">
      <div className="grid gap-0.5">
        <h2 id="plan-changes-title" className={textRole('sectionTitle')}>
          Change plan
        </h2>
        <p className="text-muted text-xs">
          Upgrades start as soon as the prorated charge for the rest of this period is paid.
          Downgrades take effect at your next renewal, with no refund for the current period.
        </p>
      </div>
      <div className="grid gap-2.5">
        {options.map((option) => (
          <div
            key={option.key}
            className={panelClasses(
              { tone: 'tonal', pad: 'compact' },
              'flex flex-col justify-between gap-3 sm:flex-row sm:items-center',
            )}
          >
            <div className="grid min-w-0 gap-0.5">
              <span className={textRole('bodyStrong')}>{option.plan.name}</span>
              {option.plan.base_price ? (
                <span className={textRole('meta')}>
                  {formatMoney(option.plan.base_price, catalog.currency_minor_units)} / month before
                  tax
                </span>
              ) : null}
            </div>
            {option.direction === 'upgrade' ? (
              <Button
                size="sm"
                disabled={held || !option.plan.checkout_available}
                onClick={() => controls.upgrade(option.key)}
              >
                Upgrade to {option.plan.name}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={held}
                onClick={() => setDowngradeTo(option)}
              >
                Downgrade to {option.plan.name}
              </Button>
            )}
          </div>
        ))}
      </div>
      {!options.some((option) => option.plan.checkout_available) ? (
        <p className="text-muted text-xs">Upgrades are unavailable while checkout is closed.</p>
      ) : null}
      {controls.downgradeError ? (
        <Alert tone="danger">{humanizeApiError(controls.downgradeError).message}</Alert>
      ) : null}
      <Dialog
        open={downgradeTo !== null}
        onOpenChange={(open) => {
          if (!open) setDowngradeTo(null);
        }}
        title={downgradeTo ? `Downgrade to ${downgradeTo.plan.name}` : 'Downgrade'}
        description="The downgrade takes effect at your next renewal."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDowngradeTo(null)}>
              Keep {currentPlan.name}
            </Button>
            <Button
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
        <p className={textRole('body')}>
          You keep {currentPlan.name} and its allowances until the end of the current period. The
          current period is not refunded.
        </p>
      </Dialog>
    </section>
  );
}
