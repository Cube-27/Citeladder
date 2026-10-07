import { ArrowRight } from 'lucide-react';

import { COMPETITORS } from '@/lib/marketing-content/compare';
import { DEMO_CTA } from '@/lib/marketing-content/nav';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { Meta } from '../primitives/label';
import { PageHero } from '../primitives/page-hero';
import { Section } from '../primitives/section';
import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';

/**
 * `/compare` — comparison index. Competitor rows are a ledger, not a card
 * grid: name, one-line position, link. A vendor disclosure and measurement
 * questions keep the comparisons tied to an explainable workflow.
 */

export function CompareIndex() {
  return (
    <>
      <PageHero
        eyebrow="Comparisons"
        title="Compare AI visibility software around your workflow."
        lead="Start with the questions your team needs to answer, the evidence it needs to inspect, and the work it plans to do next. These comparisons explain the products’ public positioning and provide a practical evaluation checklist."
      />

      <Section tone="paper" rhythm="tight" aria-label="Competitors">
        <p className="website-body text-muted mb-6 max-w-3xl">
          Published by CiteLadder. These are vendor-authored comparisons, not independent rankings.
          Product scope, plans and availability can change; use the linked official sources when
          evaluating a purchase.
        </p>
        <div className="website-body text-accent-text flex flex-wrap gap-5">
          <a href="/best-ai-visibility-platforms" className="underline underline-offset-2">
            Read the seven-platform research comparison
          </a>
          <a href="/ai-citation-tracking" className="underline underline-offset-2">
            Understand citation tracking
          </a>
          <a href="/ai-search-share-of-voice" className="underline underline-offset-2">
            Understand AI share of voice
          </a>
          <a href="/platform/citation-intelligence" className="underline underline-offset-2">
            Explore CiteLadder Citation Intelligence
          </a>
        </div>
        <div className="mb-5 flex items-center justify-between gap-4">
          <Meta as="p">Choose a tool</Meta>
          <Meta>{COMPETITORS.length} comparisons</Meta>
        </div>

        {COMPETITORS.length === 0 ? (
          <p className="website-body border-border-subtle text-muted rounded-[var(--radius-card)] border border-dashed p-8 text-center">
            Comparison notes publish as each vendor review completes.
          </p>
        ) : (
          <StaggerGroup className="border-border-subtle divide-border-subtle bg-panel divide-y overflow-hidden rounded-[var(--radius-card)] border">
            {COMPETITORS.map((competitor) => (
              <StaggerItem key={competitor.slug}>
                <a
                  href={`/compare/${competitor.slug}`}
                  className="hover:bg-accent-soft group flex items-center gap-5 px-5 py-4 transition-colors duration-200 md:px-6 md:py-5"
                >
                  <span
                    aria-hidden
                    className="bg-accent-soft text-accent-text font-display grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] text-sm font-medium"
                  >
                    {competitor.name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block text-base font-medium">
                      CiteLadder vs {competitor.name}
                    </span>
                    <span className="text-muted mt-1 block text-sm">{competitor.tagline}</span>
                  </span>
                  <span className="text-accent-text hidden items-center gap-2 text-sm font-medium sm:inline-flex">
                    Read comparison
                    <ArrowRight
                      className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                  <ArrowRight className="text-accent-text size-4 shrink-0 sm:hidden" aria-hidden />
                </a>
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}
      </Section>

      <Section tone="sunken" rhythm="tight" aria-labelledby="compare-fair-title">
        <Reveal className="mb-6 max-w-3xl">
          <h2 id="compare-fair-title" className="website-section-heading text-foreground">
            Agree on the measurement before comparing the score.
          </h2>
          <p className="website-body-lg text-muted mt-3">
            Ask each vendor what it observes, how it selects prompts, what it counts and how you can
            inspect the evidence. Confirm collection sources, current limits and the total cost for
            your actual workflow.
          </p>
        </Reveal>

        <p className="website-body text-muted">
          Read{' '}
          <a
            href="/blog/verify-improve-ai-search-visibility"
            className="text-accent-text underline"
          >
            how to measure AI visibility
          </a>{' '}
          and{' '}
          <a
            href="/blog/action-playbook-winning-ai-citations"
            className="text-accent-text underline"
          >
            how to investigate citations
          </a>
          {'.'}
        </p>
      </Section>

      <Section
        tone="paper"
        rhythm="base"
        className="marketing-closing-band"
        aria-label="Get started"
      >
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="website-section-heading origin-centre text-foreground mx-auto mb-3 max-w-[28ch]">
            Evaluate CiteLadder using your own questions.
          </h2>
          <p className="website-body-lg text-muted mx-auto max-w-[56ch]">
            Bring a small prompt portfolio and the reporting questions your team needs to answer.
          </p>
          <div className="mt-8 flex items-stretch justify-center gap-3 sm:items-center sm:gap-4">
            <DemoButtonLink className="min-w-0 flex-1 sm:flex-none">
              {DEMO_CTA}
              <ArrowRight aria-hidden />
            </DemoButtonLink>
            <ButtonLink href="/faq" variant="ghost" className="min-w-0 flex-1 sm:flex-none">
              Read the FAQ
            </ButtonLink>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
