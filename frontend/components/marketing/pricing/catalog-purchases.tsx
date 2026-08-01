'use client';

import type { BillingCatalog, CatalogAddon, CatalogTopup } from '@/lib/api/billing';
import { formatMoney, isPurchasable } from '@/lib/billing/catalog';

/**
 * Add-ons and top-ups, rendered generically.
 *
 * There is no key-specific branch here: whatever the catalog publishes
 * renders, including entries added after this file was written. An entry with
 * no `unit_price` is UNPRICED, which is not the same as free — it renders as
 * unavailable and cannot start a mutation.
 */
export function CatalogPurchases({
  catalog,
  onActivateAddon,
  onPurchaseTopup,
  pendingKey,
}: Readonly<{
  catalog: BillingCatalog;
  onActivateAddon: (addon: CatalogAddon) => void;
  onPurchaseTopup: (topup: CatalogTopup) => void;
  pendingKey: string | null;
}>) {
  if (catalog.addons.length === 0 && catalog.topups.length === 0) return null;

  return (
    <div className="grid gap-8">
      {catalog.addons.length > 0 && (
        <section aria-label="Add-ons" className="grid gap-3">
          <h3 className="font-mkt-display text-mkt-ink text-mkt-d5">Add-ons</h3>
          {catalog.addons.map((addon) => (
            <PurchaseRow
              key={addon.key}
              entry={addon}
              catalog={catalog}
              cadence="per month"
              pending={pendingKey === addon.key}
              onPurchase={() => onActivateAddon(addon)}
            />
          ))}
        </section>
      )}

      {catalog.topups.length > 0 && (
        <section aria-label="Top-ups" className="grid gap-3">
          <h3 className="font-mkt-display text-mkt-ink text-mkt-d5">Top-ups</h3>
          {catalog.topups.map((topup) => (
            <PurchaseRow
              key={topup.key}
              entry={topup}
              catalog={catalog}
              cadence="one-off"
              pending={pendingKey === topup.key}
              onPurchase={() => onPurchaseTopup(topup)}
              // Forfeiture has to be visible AT PURCHASE, not only later on
              // the usage meter — it is a term of the sale.
              footnote={`Credits expire ${topup.expiry_days} days after purchase; unused credits are forfeited.`}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function PurchaseRow({
  entry,
  catalog,
  cadence,
  pending,
  onPurchase,
  footnote,
}: Readonly<{
  entry: CatalogAddon | CatalogTopup;
  catalog: BillingCatalog;
  cadence: string;
  pending: boolean;
  onPurchase: () => void;
  footnote?: string;
}>) {
  const purchasable = isPurchasable(entry);
  return (
    <div
      data-catalog-key={entry.key}
      className="rounded-mkt-lg bg-mkt-surface shadow-card grid gap-2 p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-mkt-ink font-medium">{entry.name}</span>
        <span className="text-mkt-ink text-mkt-sm tabular-nums">
          {entry.unit_price
            ? `${formatMoney(entry.unit_price, catalog.currency_minor_units)} ${cadence}`
            : 'Not yet priced'}
        </span>
      </div>
      <p className="text-mkt-sm text-mkt-ink-soft">{entry.description}</p>
      {footnote && <p className="text-mkt-xs text-mkt-ink-muted">{footnote}</p>}
      <button
        type="button"
        disabled={!purchasable || pending}
        onClick={onPurchase}
        className="border-mkt-line text-mkt-ink focus-ring text-mkt-sm mt-1 inline-flex h-10 w-fit items-center justify-center rounded-sm border px-4 font-medium disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Starting…' : `Add ${entry.name}`}
      </button>
      {!purchasable && entry.unavailable_reason && (
        <p className="text-mkt-xs text-mkt-ink-muted">{entry.unavailable_reason}</p>
      )}
    </div>
  );
}
