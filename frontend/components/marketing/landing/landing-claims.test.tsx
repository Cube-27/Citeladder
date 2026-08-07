import { render, screen } from '@testing-library/react';
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
 *
 * The prior methodology-disclosure section (measurement mode / exact model /
 * retrieval state / benchmark cadence axes) was removed with the rewrite in
 * favor of the Proof section's evidence-loop narrative — there is no longer a
 * "how it was produced" region to guard, so those claim tests were removed
 * along with it rather than pinned to content that no longer exists.
 */
describe('Landing claims', () => {
  it('does not promise a run schedule the product does not run', () => {
    const { container } = render(<Page />);

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

  it('displays no coming soon markers anywhere on the page', () => {
    const { container } = render(<Page />);

    expect(container.querySelectorAll('[data-coming-soon]')).toHaveLength(0);
    expect(screen.queryByText('Coming soon')).toBeNull();
  });
});
