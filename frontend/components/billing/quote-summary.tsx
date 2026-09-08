'use client';

import type { BillingQuote } from '@/lib/api/billing';
import { formatMoney } from '@/lib/billing/catalog';

import { Alert } from '@/components/ui/alert';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';

export function BillingQuoteSummary({
  quote,
  currencyMinorUnits = 2,
  variant = 'pricing',
}: Readonly<{
  quote: BillingQuote;
  currencyMinorUnits?: number;
  variant?: 'pricing' | 'settings';
}>) {
  const treatment = quote.tax_treatment.replaceAll('_', ' ');
  if (variant === 'settings') {
    return (
      <Alert tone="info">
        <p>Server tax treatment: {treatment}</p>
        <p className={textRole('emphasis')}>
          Server-resolved total: {formatMoney(quote.total_price, currencyMinorUnits)}
        </p>
      </Alert>
    );
  }
  return (
    <output className={panelClasses({ tone: 'tonal' }, 'grid gap-1 text-sm')}>
      <span className="text-muted">Server quote</span>
      <span>Tax treatment: {treatment}</span>
      <span className={textRole('emphasis')}>
        Total: {formatMoney(quote.total_price, currencyMinorUnits)}
      </span>
    </output>
  );
}
