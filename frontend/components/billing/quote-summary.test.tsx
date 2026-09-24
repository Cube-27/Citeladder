import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import type { BillingQuote } from '@/lib/api/billing';

import { BillingQuoteSummary } from './quote-summary';

const inr = (amount_minor: number) => ({ currency: 'INR' as const, amount_minor });

function quote(overrides: Partial<BillingQuote>): BillingQuote {
  return {
    quote_id: 'q1',
    catalog_revision: 'launch-pricing-v1',
    catalog_key: 'tier_1',
    credential_mode: 'byok',
    country_code: 'IN',
    region: 'india',
    base_price: inr(449900),
    subtotal_price: inr(449900),
    discount: inr(0),
    taxable_value: inr(449900),
    credit_price: null,
    tax: inr(80982),
    tax_treatment: 'CGST_SGST',
    tax_rate: '0.18',
    cgst: inr(40491),
    sgst: inr(40491),
    igst: inr(0),
    tax_policy_version: 1,
    total_price: inr(530882),
    expires_at: '2026-09-24T12:00:00Z',
    ...overrides,
  };
}

describe('BillingQuoteSummary', () => {
  it('splits the combined GST rate across CGST and SGST within Maharashtra', () => {
    render(<BillingQuoteSummary quote={quote({})} />);
    expect(screen.getByText('CGST (9%)')).toBeInTheDocument();
    expect(screen.getByText('SGST (9%)')).toBeInTheDocument();
    expect(screen.queryByText(/IGST/)).toBeNull();
  });

  it('charges the full rate as IGST for another Indian state', () => {
    render(
      <BillingQuoteSummary
        quote={quote({ tax_treatment: 'IGST', cgst: inr(0), sgst: inr(0), igst: inr(80982) })}
      />,
    );
    expect(screen.getByText('IGST (18%)')).toBeInTheDocument();
    expect(screen.queryByText(/CGST/)).toBeNull();
  });
});
