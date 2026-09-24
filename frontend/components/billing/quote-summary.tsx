'use client';

import type { BillingQuote } from '@/lib/api/billing';
import { formatMoney } from '@/lib/billing/catalog';

import { DisplayTime } from '@/components/ui/display-time';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';

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
  for (const [label, value] of [
    ['CGST', quote.cgst],
    ['SGST', quote.sgst],
    ['IGST', quote.igst],
  ] as const) {
    if (value.amount_minor > 0) lines.push([`${label} (${quote.tax_rate}%)`, money(value)]);
  }
  return (
    <output className={panelClasses({ tone: 'tonal' }, 'grid gap-2 text-sm')}>
      <span className="text-muted">
        Quote · {TREATMENT_LABEL[quote.tax_treatment]} · valid until{' '}
        <DisplayTime value={quote.expires_at} />
      </span>
      <dl className="grid gap-1">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="border-border flex justify-between gap-4 border-t pt-1">
          <dt className={textRole('emphasis')}>Total</dt>
          <dd className={textRole('emphasis', 'tabular-nums')}>{money(quote.total_price)}</dd>
        </div>
      </dl>
    </output>
  );
}
