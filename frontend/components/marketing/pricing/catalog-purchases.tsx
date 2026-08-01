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
/**
 * Turn an API reason code into a sentence. These are enum values from the
 * billing contract (`not_yet_priced`, `contact_sales`, …) and were rendering
 * verbatim, so a customer saw `not_yet_priced` under a disabled button. Unknown
 * codes fall back to a de-underscored form rather than being swallowed — a new
 * reason should still say something rather than nothing.
 */
function reasonLabel(reason: string): string {
  const KNOWN: Record<string, string> = {
    not_yet_priced: 'Pricing to be announced.',
    contact_sales: 'Available through sales.',
    funded_not_priced: 'Not available on funded credits yet.',
    trial_unavailable: 'No trial on this item.',
  };
  if (Object.hasOwn(KNOWN, reason)) return KNOWN[reason];
  const words = reason.replaceAll('_', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

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
    <div className="gap-mkt-30 grid">
      {catalog.addons.length > 0 && (
        <section aria-label="Add-ons" className="gap-mkt-14 grid">
          <h3 className="font-mkt-display text-mkt-ink text-mkt-hsm">Add-ons</h3>
          <div className="gap-mkt-14 grid sm:grid-cols-2 lg:grid-cols-3">
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
          </div>
        </section>
      )}

      {catalog.topups.length > 0 && (
        <section aria-label="Top-ups" className="gap-mkt-14 grid">
          <h3 className="font-mkt-display text-mkt-ink text-mkt-hsm">Top-ups</h3>
          <div className="gap-mkt-14 grid sm:grid-cols-2 lg:grid-cols-3">
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
          </div>
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
    // A compact tile in a grid, not a full-width band: 20px padding and a 6px
    // internal rhythm. These are secondary purchases sitting under the plan
    // cards, so each one stacked at card scale made the section longer than
    // the plans it supplements.
    <div
      data-catalog-key={entry.key}
      className="rounded-mkt-lg bg-mkt-surface shadow-mkt-card gap-mkt-6 p-mkt-20 flex flex-col"
    >
      <div className="gap-mkt-10 flex flex-wrap items-baseline justify-between">
        <span className="text-mkt-ink text-mkt-sm font-medium">{entry.name}</span>
        <span className="text-mkt-ink text-mkt-sm tabular-nums">
          {entry.unit_price
            ? `${formatMoney(entry.unit_price, catalog.currency_minor_units)} ${cadence}`
            : 'Not yet priced'}
        </span>
      </div>
      <p className="text-mkt-xs text-mkt-ink-soft flex-1">{entry.description}</p>
      {footnote && <p className="text-mkt-xs text-mkt-ink-soft">{footnote}</p>}
      <button
        type="button"
        disabled={!purchasable || pending}
        onClick={onPurchase}
        className="border-mkt-black-10 text-mkt-ink focus-ring text-mkt-xs mt-mkt-6 rounded-mkt-pill px-mkt-14 inline-flex h-8 w-fit items-center justify-center border font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Starting…' : `Add ${entry.name}`}
      </button>
      {!purchasable && entry.unavailable_reason && (
        <p className="text-mkt-xs text-mkt-ink-soft">{reasonLabel(entry.unavailable_reason)}</p>
      )}
    </div>
  );
}
