import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { DisplayTime } from '@/components/ui/display-time';
import { Input } from '@/components/ui/input';
import { SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { Text } from '@/components/ui/typography';
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

function gateReason(entry: Extra): string | null {
  if (isPurchasable(entry) || !entry.unavailable_reason) return null;
  return billingReasonMessage(entry.unavailable_reason);
}

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
  reasonId: string;
  onBuy: () => void;
}>) {
  if (!reason)
    return (
      <Button variant="secondary" disabled={disabled} onClick={onBuy}>
        Buy {name}
      </Button>
    );
  return (
    <Tooltip content={reason} describe={false}>
      <Button variant="secondary" aria-disabled="true" aria-describedby={reasonId}>
        Buy {name}
      </Button>
    </Tooltip>
  );
}

function ExtraRow({
  entry,
  kind,
  catalog,
  disabled,
  onBuy,
}: Readonly<{
  entry: Extra;
  kind: 'addon' | 'topup';
  catalog: BillingCatalog;
  disabled: boolean;
  onBuy: ExtraPurchase;
}>) {
  const [typed, setTyped] = useState(String(entry.quantity_min));
  const quantity = clampQuantity(Number(typed), entry);
  const purchasable = isPurchasable(entry);
  const inputId = `extra-quantity-${entry.key}`;
  const reason = gateReason(entry);
  const reasonId = useId();
  return (
    <SettingRow
      label={entry.name}
      description={
        <>
          {entry.description ? <p>{entry.description}</p> : null}
          <p>
            {entry.unit_price
              ? `${formatMoney(entry.unit_price, catalog.currency_minor_units)} each, one-time, before tax · `
              : ''}
            usable for {entry.expiry_days} days or until your plan ends, whichever is first
          </p>
        </>
      }
      action={
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
            reason={reason}
            reasonId={reasonId}
            onBuy={() => onBuy(kind, entry.key, quantity)}
          />
        </>
      }
    >
      {reason ? (
        <Text as="p" id={reasonId} variant="caption" align="end">
          {reason}
        </Text>
      ) : null}
    </SettingRow>
  );
}

type ExtraGrant = BillingEntitlement['grants'][number];

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

function ActiveExtras({ grants }: Readonly<{ grants: readonly ExtraGrant[] }>) {
  if (grants.length === 0) return null;
  return (
    <SettingsGroup title="Active purchases">
      <SettingRows>
        {grants.map((grant) => (
          <SettingRow
            key={grant.grant_id}
            label={`+${grant.value} ${capabilityLabel(grant.key).toLowerCase()}`}
            value={
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
      </SettingRows>
    </SettingsGroup>
  );
}

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
  if (addons.length === 0 && topups.length === 0 && grants.length === 0) return null;
  const extras = [
    ...addons.map((entry) => ({ entry, kind: 'addon' as const })),
    ...topups.map((entry) => ({ entry, kind: 'topup' as const })),
  ];
  return (
    <>
      {extras.length > 0 ? (
        <SettingsGroup title="Add-ons and top-ups">
          <SettingRows>
            {extras.map(({ entry, kind }) => (
              <ExtraRow
                key={entry.key}
                entry={entry}
                kind={kind}
                catalog={catalog}
                disabled={disabled}
                onBuy={onBuy}
              />
            ))}
          </SettingRows>
        </SettingsGroup>
      ) : null}
      <ActiveExtras grants={grants} />
    </>
  );
}
