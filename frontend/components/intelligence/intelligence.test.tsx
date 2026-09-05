import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Insight, type InsightModel } from './insight';
import { ProvenanceChip } from './provenance-chip';

const EVIDENCE = { href: '/issues?filter=weak', label: '47 product pages' };

function insightFixture(overrides: Partial<InsightModel> = {}): InsightModel {
  return {
    id: 'insight-1',
    layer: 'site',
    priority: 'high',
    claim: '47 product pages have weak buying-intent coverage',
    evidence: EVIDENCE,
    whyThisMatters: 'Visitors cannot find purchase answers',
    potentialImpact: 'high',
    ...overrides,
  };
}

describe('Insight', () => {
  it('renders only evidence-backed insight anatomy', () => {
    const { rerender, container } = render(<Insight insight={insightFixture()} />);
    expect(
      screen.getByText('47 product pages have weak buying-intent coverage'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '47 product pages' })).toHaveAttribute(
      'href',
      '/issues?filter=weak',
    );

    rerender(<Insight insight={insightFixture({ evidence: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders whyThisMatters by default and omits it when hideWhyThisMatters is set', () => {
    const { rerender } = render(<Insight insight={insightFixture()} />);
    expect(screen.getByText('Why this matters')).toBeInTheDocument();
    expect(screen.getByText('Visitors cannot find purchase answers')).toBeInTheDocument();

    rerender(<Insight insight={insightFixture()} hideWhyThisMatters />);
    expect(screen.queryByText('Why this matters')).not.toBeInTheDocument();
    expect(screen.queryByText('Visitors cannot find purchase answers')).not.toBeInTheDocument();
    expect(
      screen.getByText('47 product pages have weak buying-intent coverage'),
    ).toBeInTheDocument();
  });

  it('preserves long evidence labels and their target', () => {
    const longLabel =
      'https://www.example.com/categories/women/womens-accessories/cotton-shopping-bag/very-long-product-name';
    render(
      <Insight insight={insightFixture({ evidence: { href: '/issues/1', label: longLabel } })} />,
    );

    expect(screen.getByText(longLabel)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: longLabel })).toHaveAttribute('href', '/issues/1');
  });
});

describe('ProvenanceChip', () => {
  it('renders the retained analyzer and snapshot provenance', () => {
    render(<ProvenanceChip provenance={{ analyzerVersion: '3', snapshotId: 'run-7' }} />);
    expect(screen.getByText('analyzer 3 · snapshot run-7')).toBeInTheDocument();
  });

  it('renders nothing when provenance is empty', () => {
    const { container } = render(<ProvenanceChip provenance={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
