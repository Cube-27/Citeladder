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
      within(screen.getByRole('list', { name: 'Questions to ask both vendors.' })).getAllByRole(
        'listitem',
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'CiteLadder pricing' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(screen.getByRole('link', { name: 'Citation Intelligence' })).toHaveAttribute(
      'href',
      '/platform/citation-intelligence',
    );
    expect(screen.getByRole('link', { name: 'AI share of voice' })).toHaveAttribute(
      'href',
      '/ai-search-share-of-voice',
    );
    expect(screen.getByRole('link', { name: 'Book a demo' })).toHaveAttribute('href', DEMO_HREF);
  });
});
