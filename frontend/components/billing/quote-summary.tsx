'use client';

import type { BillingQuote } from '@/lib/api/billing';
import { formatMoney } from '@/lib/billing/catalog';

import { DisplayTime } from '@/components/ui/display-time';
import { FactList } from '@/components/ui/facts';
import { Stack } from '@/components/ui/layout';
import { panelClasses } from '@/components/ui/panel';

const TREATMENT_LABEL: Record<BillingQuote['tax_treatment'], string> = {
  CGST_SGST: 'GST within Maharashtra (CGST + SGST)',
  IGST: 'GST outside Maharashtra (IGST)',
  EXPORT_ZERO_RATED: 'Export of service, zero-rated',
};

/**
 * The server quote, line by line: base, any discount, each GST component the
 * quote actually carries, and the total. Every figure is the server's own;
 * nothing here adds, rounds or converts.
 */
export function BillingQuoteSummary({
  quote,
  currencyMinorUnits = 2,
}: Readonly<{ quote: BillingQuote; currencyMinorUnits?: number }>) {
  const money = (value: BillingQuote['total_price']) => formatMoney(value, currencyMinorUnits);
  const lines: [string, string][] = [['Price', money(quote.subtotal_price)]];
  if (quote.discount.amount_minor > 0) lines.push(['Discount', `−${money(quote.discount)}`]);
  if (quote.taxable_value.amount_minor !== quote.subtotal_price.amount_minor) {
    lines.push(['Taxable value', money(quote.taxable_value)]);
  }
  // `tax_rate` is the combined GST rate as a fraction ("0.18"). CGST and SGST
  // each carry half of it; IGST carries all of it — the same split the
  // invoice PDF prints.
  const combined = Number(quote.tax_rate) * 100;
  for (const [label, value, share] of [
    ['CGST', quote.cgst, 0.5],
    ['SGST', quote.sgst, 0.5],
    ['IGST', quote.igst, 1],
  ] as const) {
    if (value.amount_minor > 0) {
      lines.push([`${label} (${Number((combined * share).toFixed(2))}%)`, money(value)]);
    }
  }
  return (
    <Stack as="output" gap="compact" className={panelClasses({ tone: 'tonal' }, 'type-body')}>
      <span className="text-muted">
        Quote · {TREATMENT_LABEL[quote.tax_treatment]} · valid until{' '}
        <DisplayTime value={quote.expires_at} />
      </span>
      <FactList
        layout="spread"
        facts={lines.map(([label, value]) => ({ label, value }))}
        total={{ label: 'Total', value: money(quote.total_price) }}
      />
    </Stack>
  );
}
