import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Page from '@/app/(marketing)/page';

// The landing page's only client island forwards signed-in visitors away;
// it needs a session provider it does not have under a plain render.
vi.mock('@/components/marketing/landing-session-redirect', () => ({
  LandingSessionRedirect: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/**
 * Claim guards for the landing page.
 *
 * These do not assert copy for its own sake — each one pins a claim the
 * product cannot currently back, so that re-introducing it fails the build
 * rather than shipping.
 */
describe('Landing claims', () => {
  it('discloses the four measurement axes', () => {
    render(<Page />);

    const section = screen.getByRole('region', { name: /every number says how it was produced/i });
    for (const term of [
      'Measurement mode',
      'Exact model',
      'Retrieval state',
      'Benchmark cadence',
    ]) {
      expect(within(section).getByRole('heading', { name: term })).toBeInTheDocument();
    }
  });

  it('explains pulse and benchmark without mixing them', () => {
    render(<Page />);

    const section = screen.getByRole('region', { name: /every number says how it was produced/i });
    expect(within(section).getByText(/never averaged together/i)).toBeInTheDocument();
    // Trend partitions are a backend invariant; the page must not promise a
    // combined line the API deliberately refuses to produce.
    expect(within(section).getByText(/never folded into one line/i)).toBeInTheDocument();
  });

  it('handles multi-model aggregates honestly', () => {
    render(<Page />);

    const section = screen.getByRole('region', { name: /every number says how it was produced/i });
    expect(
      within(section).getByText(/never picks one to stand in for the rest/i),
    ).toBeInTheDocument();
  });

  it('treats cadence as an allowance, never as a schedule', () => {
    const { container } = render(<Page />);

    const section = screen.getByRole('region', { name: /every number says how it was produced/i });
    expect(within(section).getByText(/nothing runs on its own/i)).toBeInTheDocument();
    // No dispatcher ships in this release, so no scheduling promise may appear.
    expect(container.textContent).not.toMatch(/next run|scheduled run|runs daily|runs weekly/i);
  });

  it('makes no comparative cost or ROI claim', () => {
    const { container } = render(<Page />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/cheaper|save \d|% cheaper|high-ROI|high ROI/i);
    // The measured-instruction figures are not attributable until the harness
    // has run against live providers.
    expect(text).not.toMatch(/-?56%|-?49%/);
  });

  it('carries no retired commercial claim', () => {
    const { container } = render(<Page />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\$49/);
    expect(text).not.toMatch(/Start free|Free plan|no card/i);
  });

  it('does not display coming soon badges on planned providers', () => {
    const { container } = render(<Page />);

    expect(container.querySelectorAll('[data-coming-soon]')).toHaveLength(0);
    expect(screen.queryByText('Coming soon')).toBeNull();
  });
});
