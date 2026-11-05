import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { COMPETITORS } from '@/lib/marketing-content/compare';
import { DEMO_HREF } from '@/lib/marketing-content/nav';

import { CompareDetailView } from './compare-detail';

describe('comparison evidence and next steps', () => {
  it.each(COMPETITORS)('keeps $name positioning attached to its sources', (competitor) => {
    render(<CompareDetailView competitor={competitor} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(competitor.name);
    expect(screen.getByText(competitor.lead)).toBeInTheDocument();
    for (const source of competitor.sources) {
      const links = screen.getAllByRole('link', { name: source.label });
      for (const link of links) {
        expect(link).toHaveAttribute('href', source.url);
        expect(link).toHaveAttribute('rel', 'noreferrer');
      }
      const disclosure = screen.getByRole('region', { name: 'Comparison sources and disclosure' });
      expect(within(disclosure).getByText(/Source reviewed/)).toHaveAttribute(
        'datetime',
        source.reviewedDate,
      );
    }
    expect(
      within(screen.getByRole('region', { name: 'Questions to ask both vendors' })).getByText(
        'Evidence',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CiteLadder pricing/ })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(screen.getByRole('link', { name: /^Cited Sources/ })).toHaveAttribute(
      'href',
      '/platform/cited-sources',
    );
    expect(screen.getByRole('link', { name: /AI share of voice/ })).toHaveAttribute(
      'href',
      '/ai-search-share-of-voice',
    );
    for (const demo of screen.getAllByRole('link', { name: 'Book a demo' })) {
      expect(demo).toHaveAttribute('href', DEMO_HREF);
    }
  });
});
