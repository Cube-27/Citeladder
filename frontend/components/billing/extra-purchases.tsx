'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { Input } from '@/components/ui/input';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import type {
  BillingCatalog,
  BillingEntitlement,
  CatalogAddon,
  CatalogTopup,
} from '@/lib/api/billing';
import { extrasForPlan, formatMoney, isPurchasable } from '@/lib/billing/catalog';
import { billingReasonMessage } from '@/lib/billing/reason-copy';
import { capabilityLabel } from '@/lib/marketing-content/pricing';

export type ExtraPurchase = (kind: 'addon' | 'topup', catalogKey: string, quantity: number) => void;

function clampQuantity(value: number, entry: CatalogAddon | CatalogTopup): number {
  if (!Number.isFinite(value) || value < 1) return entry.quantity_min;
  return Math.min(entry.quantity_max, Math.max(entry.quantity_min, Math.trunc(value)));
}

function ExtraRow({
  entry,
  kind,
  catalog,
  disabled,
  onBuy,
}: Readonly<{
  entry: CatalogAddon | CatalogTopup;
  kind: 'addon' | 'topup';
  catalog: BillingCatalog;
  disabled: boolean;
  onBuy: ExtraPurchase;
}>) {
  // Kept as typed text and clamped when read: clamping each keystroke turns
  // clearing the field and typing 3 into "13", then the maximum.
  const [typed, setTyped] = useState(String(entry.quantity_min));
  const quantity = clampQuantity(Number(typed), entry);
  const purchasable = isPurchasable(entry);
  const inputId = `extra-quantity-${entry.key}`;
  return (
    <div
      className={panelClasses(
        { tone: 'tonal', pad: 'compact' },
        'flex flex-col justify-between gap-3 sm:flex-row sm:items-center',
      )}
    >
      <div className="grid min-w-0 gap-0.5">
        <span className={textRole('bodyStrong')}>{entry.name}</span>
        {entry.description ? <p className="text-muted text-xs">{entry.description}</p> : null}
        <span className={textRole('meta')}>
          {entry.unit_price
            ? `${formatMoney(entry.unit_price, catalog.currency_minor_units)} each, one-time, before tax · `
            : ''}
          usable for {entry.expiry_days} days or until your plan ends, whichever is first
        </span>
        {!purchasable && entry.unavailable_reason ? (
          <span className="text-muted text-xs">
            {billingReasonMessage(entry.unavailable_reason)}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Quantity of {entry.name}
        </label>
        <Input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={entry.quantity_min}
          max={entry.quantity_max}
          value={typed}
          disabled={!purchasable || disabled}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={() => setTyped(String(quantity))}
          className="h-8 w-16 text-center tabular-nums"
        />
        <Button
          size="sm"
          disabled={!purchasable || disabled}
          onClick={() => onBuy(kind, entry.key, quantity)}
        >
          Buy {entry.name}
        </Button>
      </div>
    </div>
  );
}

/** Add-on and top-up grants still in force, each with the date it lapses. */
function ActiveExtras({ entitlement }: Readonly<{ entitlement: BillingEntitlement | null }>) {
  const grants = (entitlement?.grants ?? []).filter(
    (grant) =>
      (grant.source_kind === 'addon' || grant.source_kind === 'topup') && grant.revoked_at === null,
  );
  if (grants.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <h3 className={textRole('bodyStrong')}>Active purchases</h3>
      <ul className="grid gap-1">
        {grants.map((grant) => (
          <li key={grant.grant_id} className={textRole('meta')}>
            +{grant.value} {capabilityLabel(grant.key).toLowerCase()} · usable until{' '}
            <DisplayTime value={grant.effective_valid_until} dateOnly fallback="your plan ends" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One-time add-ons and top-ups for the current plan. Each purchase goes
 * through the server quote first; the quantity picker is bounded by the
 * catalog's own limits and the server re-checks them.
 */
export function ExtraPurchases({
  catalog,
  planKey,
  entitlement,
  disabled,
  onBuy,
}: Readonly<{
  catalog: BillingCatalog;
  planKey: string;
  entitlement: BillingEntitlement | null;
  disabled: boolean;
  onBuy: ExtraPurchase;
}>) {
  const { addons, topups } = extrasForPlan(catalog, planKey);
  if (addons.length === 0 && topups.length === 0) return null;
  return (
    <section className={panelClasses({}, 'grid gap-3')} aria-labelledby="extras-title">
      <div className="grid gap-0.5">
        <h2 id="extras-title" className={textRole('sectionTitle')}>
          Add-ons and top-ups
        </h2>
        <p className="text-muted text-xs">
          One-time purchases. They work only while your paid plan is active and never renew.
        </p>
      </div>
      <div className="grid gap-2.5">
        {addons.map((entry) => (
          <ExtraRow
            key={entry.key}
            entry={entry}
            kind="addon"
            catalog={catalog}
            disabled={disabled}
            onBuy={onBuy}
          />
        ))}
        {topups.map((entry) => (
          <ExtraRow
            key={entry.key}
            entry={entry}
            kind="topup"
            catalog={catalog}
            disabled={disabled}
            onBuy={onBuy}
          />
        ))}
      </div>
      <ActiveExtras entitlement={entitlement} />
    </section>
  );
}
