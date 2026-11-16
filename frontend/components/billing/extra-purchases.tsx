import { useId, useState } from 'react';

import { AppGrid } from '@/components/ui/app-grid';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { ControlRow } from '@/components/ui/control-row';
import { DisplayTime } from '@/components/ui/display-time';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { LedgerItem, LedgerList } from '@/components/ui/ledger-list';
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

type Extra = CatalogAddon | CatalogTopup;

/** Why an extra cannot be bought, or null when it can. */
function gateReason(entry: Extra): string | null {
  if (isPurchasable(entry) || !entry.unavailable_reason) return null;
  return billingReasonMessage(entry.unavailable_reason);
}

/** One reason every gated extra shares (two or more), said once under the section head. */
function sharedGateReason(entries: readonly Extra[]): string | null {
  const reasons = entries.map(gateReason).filter((reason) => reason !== null);
  const [first] = reasons;
  if (first === undefined || reasons.length < 2 || reasons.length !== entries.length) return null;
  return reasons.every((reason) => reason === first) ? first : null;
}

/**
 * Buy, disabled with its reason (tooltip and description) while the catalog
 * gates it. A shared reason is the section's caption, which it points at.
 */
function BuyButton({
  name,
  disabled,
  reason,
  reasonId,
  onBuy,
}: Readonly<{
  name: string;
  disabled: boolean;
  reason: string | null;
  reasonId: string | null;
  onBuy: () => void;
}>) {
  const ownReasonId = useId();
  const describedBy = reason ? (reasonId ?? ownReasonId) : undefined;
  const button = (
    <Button variant="secondary" disabled={disabled} onClick={onBuy} aria-describedby={describedBy}>
      Buy {name}
    </Button>
  );
  if (!reason) return button;
  return (
    <>
      {reasonId ? null : (
        <span id={ownReasonId} hidden>
          {reason}
        </span>
      )}
      <Tooltip content={reason} describe={false}>
        {/* A disabled button takes no pointer events, so its wrapper opens the tip. */}
        <span className="inline-flex">{button}</span>
      </Tooltip>
    </>
  );
}

function ExtraRow({
  entry,
  kind,
  catalog,
  disabled,
  sharedReasonId,
  onBuy,
}: Readonly<{
  entry: Extra;
  kind: 'addon' | 'topup';
  catalog: BillingCatalog;
  disabled: boolean;
  /** The section caption's id when it already says why this extra is gated. */
  sharedReasonId: string | null;
  onBuy: ExtraPurchase;
}>) {
  // Kept as typed text and clamped when read: clamping each keystroke turns
  // clearing the field and typing 3 into "13", then the maximum.
  const [typed, setTyped] = useState(String(entry.quantity_min));
  const quantity = clampQuantity(Number(typed), entry);
  const purchasable = isPurchasable(entry);
  const inputId = `extra-quantity-${entry.key}`;
  return (
    <ControlRow
      controls={
        <>
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
            width="quantity"
          />
          <BuyButton
            name={entry.name}
            disabled={!purchasable || disabled}
            reason={gateReason(entry)}
            reasonId={sharedReasonId}
            onBuy={() => onBuy(kind, entry.key, quantity)}
          />
        </>
      }
    >
      <span className={textRole('body')}>{entry.name}</span>
      {entry.description ? <p className="type-caption">{entry.description}</p> : null}
      <span className={textRole('caption')}>
        {entry.unit_price
          ? `${formatMoney(entry.unit_price, catalog.currency_minor_units)} each, one-time, before tax · `
          : ''}
        usable for {entry.expiry_days} days or until your plan ends, whichever is first
      </span>
    </ControlRow>
  );
}

type ExtraGrant = BillingEntitlement['grants'][number];

/**
 * Add-on and top-up grants in force when the entitlement resolved. `grants`
 * holds the account's whole history, lapsed and revoked grants included.
 */
function activeExtraGrants(entitlement: BillingEntitlement | null): ExtraGrant[] {
  if (!entitlement) return [];
  const at = Date.parse(entitlement.resolved_at);
  const after = (time: string | null) => time === null || Date.parse(time) > at;
  return entitlement.grants.filter(
    (grant) =>
      (grant.source_kind === 'addon' || grant.source_kind === 'topup') &&
      Date.parse(grant.valid_from) <= at &&
      after(grant.effective_valid_until) &&
      after(grant.revoked_at),
  );
}

/** Add-on and top-up grants still in force, each with the date it lapses. */
function ActiveExtras({ grants }: Readonly<{ grants: readonly ExtraGrant[] }>) {
  if (grants.length === 0) return null;
  return (
    <Section aria-labelledby="active-extras-title">
      <SectionHeader>
        <SectionTitle id="active-extras-title" level={3}>
          Active purchases
        </SectionTitle>
      </SectionHeader>
      <SectionContent>
        <LedgerList>
          {grants.map((grant) => (
            <LedgerItem
              key={grant.grant_id}
              title={`+${grant.value} ${capabilityLabel(grant.key).toLowerCase()}`}
              caption={
                <>
                  Usable until{' '}
                  <DisplayTime
                    value={grant.effective_valid_until}
                    dateOnly
                    fallback="your plan ends"
                  />
                </>
              }
            />
          ))}
        </LedgerList>
      </SectionContent>
    </Section>
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
  const grants = activeExtraGrants(entitlement);
  const sharedReasonId = useId();
  const sharedReason = sharedGateReason([...addons, ...topups]);
  // Purchases still in force stay listed even when the catalogue offers nothing more to buy.
  if (addons.length === 0 && topups.length === 0 && grants.length === 0) return null;
  const extras = [
    ...addons.map((entry) => ({ entry, kind: 'addon' as const })),
    ...topups.map((entry) => ({ entry, kind: 'topup' as const })),
  ];
  return (
    <Section aria-labelledby="extras-title">
      <SectionHeader>
        <SectionTitle id="extras-title">Add-ons and top-ups</SectionTitle>
        <SectionDescription>
          One-time purchases. They work only while your paid plan is active and never renew.
        </SectionDescription>
        {sharedReason ? (
          <p id={sharedReasonId} className={textRole('caption', 'text-ink-2')}>
            {sharedReason}
          </p>
        ) : null}
      </SectionHeader>
      <Stack as={SectionContent} gap="compact">
        {extras.length > 0 ? (
          <AppGrid layout="slips">
            {extras.map(({ entry, kind }) => (
              <ExtraRow
                key={entry.key}
                entry={entry}
                kind={kind}
                catalog={catalog}
                disabled={disabled}
                sharedReasonId={sharedReason ? sharedReasonId : null}
                onBuy={onBuy}
              />
            ))}
          </AppGrid>
        ) : null}
        <ActiveExtras grants={grants} />
      </Stack>
    </Section>
  );
}
