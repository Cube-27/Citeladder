import { type BillingCatalog } from '@/lib/api/billing';
import { formatMoney } from '@/lib/billing/catalog';
import { type PendingPricingIntentV1 } from '@/lib/billing/pending-pricing-intent';

export function PricingResumePrompt({
  intent,
  catalog,
  valid,
  pending,
  onConfirm,
  onDismiss,
}: Readonly<{
  intent: PendingPricingIntentV1 | null;
  catalog: BillingCatalog | null;
  valid: boolean;
  pending: boolean;
  onConfirm: (intent: PendingPricingIntentV1) => void;
  onDismiss: () => void;
}>) {
  if (!intent) return null;
  const entries = intent.kind === 'addon' ? catalog?.addons : catalog?.topups;
  const entry = entries?.find((candidate) => candidate.key === intent.catalog_key);
  const price =
    entry?.unit_price && catalog
      ? `${formatMoney({ ...entry.unit_price, amount_minor: entry.unit_price.amount_minor * intent.quantity }, catalog.currency_minor_units)} before tax.`
      : 'Current price unavailable.';

  return (
    <div className="mb-6 flex items-center gap-3">
      <p>
        Review {entry?.name ?? intent.catalog_key}, quantity {intent.quantity}. {price}
      </p>
      <button type="button" disabled={!valid || pending} onClick={() => onConfirm(intent)}>
        Confirm purchase
      </button>
      <button type="button" onClick={onDismiss}>
        Dismiss selection
      </button>
    </div>
  );
}
