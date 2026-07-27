import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { DEMO_HREF } from '@/lib/marketing-content/nav';
import { PRICING_TABLE_ROWS, PRICING_TIERS } from '@/lib/marketing-content/pricing';

import Page from './page';

// Plain render — no providers, no MSW: the pricing page is a sync RSC with no
// client islands of its own (the shared nav/footer chrome lives in the group
// layout and is covered by its own component tests + e2e).
describe('Pricing page (public marketing `/pricing`)', () => {
  it('renders exactly one h1 and keeps the product name out of h2-h6', () => {
    render(<Page />);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/pay for the evidence layer/i);

    // No h2-h6 may contain the product name (keeps heading queries unambiguous).
    for (const heading of screen.getAllByRole('heading')) {
      if (heading === h1s[0]) continue;
      expect(heading).not.toHaveTextContent(/searchify/i);
    }
  });

  it('renders the approved tier cards verbatim from the content module', () => {
    const { container } = render(<Page />);

    expect(container.querySelectorAll('[data-tier]')).toHaveLength(PRICING_TIERS.length);

    for (const tier of PRICING_TIERS) {
      const card = container.querySelector<HTMLElement>(`[data-tier="${tier.key}"]`);
      expect(card, `tier card "${tier.name}"`).not.toBeNull();
      // The published price renders exactly as the module states it.
      expect(card!.querySelector('[data-price]')).toHaveTextContent(tier.price);
      expect(
        within(card!).getByRole('link', { name: new RegExp(tier.cta.label, 'i') }),
      ).toHaveAttribute('href', tier.cta.href);
    }

    // No unfinished placeholder may reach the page.
    expect(container.textContent).not.toMatch(/TODO\(user\)/);

    // Exactly one recommended tier, and it is the module's highlighted one.
    const highlighted = container.querySelectorAll('[data-tier][data-highlighted="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveAttribute(
      'data-tier',
      PRICING_TIERS.find((tier) => tier.highlighted)!.key,
    );
  });

  it('renders the comparison table with the grounded dimensions', () => {
    const { container } = render(<Page />);

    for (const tier of PRICING_TIERS) {
      expect(screen.getByRole('columnheader', { name: tier.name })).toBeInTheDocument();
    }
    expect(container.querySelector('th[data-highlighted="true"]')).toHaveTextContent('Paid');

    // One header row + one body row per module dimension, each addressable.
    expect(screen.getAllByRole('row')).toHaveLength(1 + PRICING_TABLE_ROWS.length);
    for (const row of PRICING_TABLE_ROWS) {
      expect(screen.getByRole('rowheader', { name: row.dimension })).toBeInTheDocument();
    }

    // Spot-check the Paid capability mapping.
    const inventoryRow = screen.getByRole('row', { name: /Site health crawl mode/ });
    expect(within(inventoryRow).getByText('Full progressive inventory')).toBeInTheDocument();
    const monitoredRow = screen.getByRole('row', { name: /User-selected monitored URLs/ });
    expect(within(monitoredRow).getByText('Included')).toBeInTheDocument();

    // Removed claims stay removed: no self-host row, and the unbacked
    // "scheduled audits" phrasing appears nowhere in the table.
    expect(screen.queryByRole('rowheader', { name: /Self-hosted/i })).toBeNull();
    expect(screen.queryByRole('rowheader', { name: /scheduled audits/i })).toBeNull();
  });

  it('states the BYOK trust claims in the hero', () => {
    render(<Page />);

    // getAllByText: "encrypted at rest" also appears in a tier's feature list,
    // which is fine — the claim just has to be stated up front too.
    expect(screen.getAllByText(/bring your own api keys/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/encrypted at rest/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no llm-as-judge scoring/i).length).toBeGreaterThan(0);
  });

  it('closes with the demo-first CTA and a route into the FAQ', () => {
    render(<Page />);

    const finalCta = screen.getByRole('region', { name: 'Get started' });
    expect(within(finalCta).getByRole('link', { name: /book a demo/i })).toHaveAttribute(
      'href',
      DEMO_HREF,
    );
    expect(within(finalCta).getByRole('link', { name: /read the faq/i })).toHaveAttribute(
      'href',
      '/faq',
    );
  });
});
