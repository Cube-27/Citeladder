import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Page from '@/app/(marketing)/page';
import { FAQ_GROUPS } from '@/lib/marketing-content/faq';

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

  /**
   * docs/architecture.md §8: CiteLadder does not claim causality from aggregate
   * correlations, and verification is descriptive — it reports what was
   * observed after a recrawl, never that the change produced the observation.
   * Causal phrasing is the easiest claim to reintroduce by accident because it
   * reads as ordinary marketing energy, so it is pinned here.
   */
  it('claims no causal link between a change and a business outcome', () => {
    const { container } = render(<Page />);
    const text = container.textContent ?? '';

    // Verb forms asserting the product moved a metric.
    expect(text).not.toMatch(
      /\b(boosts?|lifts?|increases?|improves?|drives?|grows?|doubles?)\s+(your\s+)?(rankings?|traffic|visibility|conversions?|revenue|sales)/i,
    );
    // Explicit cause language tying an action to an outcome.
    //
    // Denials are the point of this page, not a violation of it. "We do not
    // claim a page change caused a ranking" is exactly the disclaimer this
    // guard exists to protect, and matching the bare verb flagged it as the
    // very claim it refuses to make. Strip the negated forms first, then test
    // what remains, so a real causal assertion still fails.
    const CAUSAL = String.raw`causes?d?|results? in|leads? to|translates? into`;
    // A denial is a negation anywhere in the same SENTENCE as the causal verb,
    // not within a fixed word distance of it — "We do not claim a page change
    // caused a ranking" puts four words between the two. Splitting on sentence
    // boundaries keeps the scope tight without counting words.
    const asserted = text
      .split(/(?<=[.!?])\s+/)
      .filter(
        (sentence) => !/\b(?:do(?:es)?\s+not|don't|doesn't|never|no|without)\b/i.test(sentence),
      )
      .join(' ');
    expect(asserted).not.toMatch(new RegExp(String.raw`\b(?:${CAUSAL})\b`, 'i'));
    // Quantified outcome deltas — no attributable figure exists.
    expect(text).not.toMatch(/\b\d+(\.\d+)?%\s*(more|higher|increase|lift|uplift|growth|gain)/i);
    expect(text).not.toMatch(/\b(\d+x|\d+×)\s*(more|better|faster|higher)/i);
  });

  /**
   * §1 of the frontend plan: the user is asked exactly twice — save content,
   * and run or schedule an audit. The approval-queue model it replaced left
   * "approval gates" and "human sign-off" promises across this page; they must
   * not come back, because they describe a product that no longer exists.
   */
  it('promises no approval gate or review step', () => {
    const { container } = render(<Page />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/approval gate|human sign-off|sign-off|review queue|review inbox/i);
    expect(text).not.toMatch(/human[- ]approved|awaiting approval|pending approval/i);
  });

  it('does not expose internal pack-readiness terminology', () => {
    const { container } = render(<Page />);
    const faqAnswers = FAQ_GROUPS.flatMap((group) => group.items.map((item) => item.a)).join(' ');

    expect(container.textContent).not.toMatch(/foundation draft|validated candidate/i);
    expect(faqAnswers).not.toMatch(/foundation draft|validated candidate/i);
  });

  /**
   * `EditableFact` exists as a component but has no production caller and no
   * persistence path, so the site must not advertise durable corrections as a
   * shipped capability. Restore the claim — and delete this guard — when
   * corrections are wired to a durable mutation.
   */
  it('does not advertise corrections the product cannot yet keep', () => {
    const { container } = render(<Page />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/durable correction|survives recompute|editable in place/i);
    expect(text).not.toMatch(/withdrawable/i);
  });

  /**
   * The same guard over the FAQ. `/faq` answered "what do I actually have to
   * do" by promising corrections that are attributed, reversible, and survive
   * the next recompute — the durable-correction claim the landing page is
   * already barred from making, in the one place it had leaked back in.
   * Delete this with the guard above once corrections are wired.
   */
  it('does not advertise durable corrections in the FAQ either', () => {
    const answers = FAQ_GROUPS.flatMap((group) => group.items.map((item) => item.a)).join(' ');

    expect(answers).not.toMatch(/durable correction|survives recompute|editable in place/i);
    expect(answers).not.toMatch(/withdrawable/i);
    expect(answers).not.toMatch(/survives the next recompute/i);
    expect(answers).not.toMatch(/the correction is attributed/i);
  });
});
