import { ArrowRight } from 'lucide-react';

import { COMPARISON_CHECKLIST, COMPETITORS } from '@/lib/marketing-content/compare';
import { DEMO_CTA } from '@/lib/marketing-content/nav';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';

/** Related reading: CiteLadder's own guides and product pages. */
const GUIDES = [
  {
    href: '/best-ai-visibility-platforms',
    title: 'Seven-platform research comparison',
    desc: 'A wider look at AI visibility platforms.',
  },
  {
    href: '/ai-citation-tracking',
    title: 'AI citation tracking',
    desc: 'How citation measurement works and how to read it.',
  },
  {
    href: '/ai-search-share-of-voice',
    title: 'AI share of voice',
    desc: 'What a share-of-voice percentage actually counts.',
  },
  {
    href: '/platform/citation-intelligence',
    title: 'Citation Intelligence',
    desc: 'Inspect the domains and URLs your tracked answers cite.',
  },
] as const;

/**
 * `/compare` — comparison index. Competitors are a ledger (name, public
 * positioning, link), followed by the shared evaluation questions and
 * related guides. A vendor disclosure sits under the heading.
 */
export function CompareIndex() {
  return (
    <>
      <PageHero
        title="Compare AI visibility software around your workflow."
        lead="Start with the questions your team needs to answer and the evidence it needs to inspect. Each comparison summarizes a product's public positioning and links to its official source."
      >
        <p className="website-label text-muted mt-6 max-w-[68ch]">
          Published by CiteLadder. These are vendor-authored comparisons, not independent rankings.
          Product scope, plans and availability can change; use the linked official sources when
          evaluating a purchase.
        </p>
      </PageHero>

      <Section rhythm="tight" className="pt-0" aria-labelledby="compare-list-title">
        <h2 id="compare-list-title" className="sr-only">
          Comparisons
        </h2>
        {COMPETITORS.length === 0 ? (
          <p className="website-body text-muted">
            Comparison notes publish as each vendor review completes.
          </p>
        ) : (
          <ul className="ed-ledger">
            {COMPETITORS.map((competitor) => (
              <li key={competitor.slug}>
                <a href={`/compare/${competitor.slug}`}>
                  <span className="website-feature-heading">CiteLadder vs {competitor.name}</span>
                  <span className="website-body text-muted">{competitor.tagline}</span>
                  <ArrowRight aria-hidden className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section tone="soft" aria-labelledby="compare-fair-title">
        <div className="mk-split">
          <SectionHeader
            headingId="compare-fair-title"
            title="Agree on the measurement before comparing the score."
            lead="Ask each vendor what it observes, how it selects prompts, what it counts and how you can inspect the evidence."
          />
          <div className="grid gap-8">
            <ol className="ed-steps">
              {COMPARISON_CHECKLIST.map((item) => (
                <li key={item.heading}>
                  <h3 className="website-feature-heading">{item.heading}</h3>
                  <p className="website-body text-muted">{item.body}</p>
                </li>
              ))}
            </ol>
            <p className="website-body text-muted">
              Read{' '}
              <a href="/blog/verify-improve-ai-search-visibility" className="ed-link">
                how to measure AI visibility
              </a>{' '}
              and{' '}
              <a href="/blog/action-playbook-winning-ai-citations" className="ed-link">
                how to investigate citations
              </a>
              {'.'}
            </p>
          </div>
        </div>
      </Section>

      <Section aria-labelledby="compare-guides-title">
        <SectionHeader headingId="compare-guides-title" title="Related guides." />
        <ul className="mk-related ed-guides">
          {GUIDES.map((guide) => (
            <li key={guide.href}>
              <a href={guide.href} className="mk-related-card">
                <span className="mk-capability-title">{guide.title}</span>
                <span className="mk-capability-desc">{guide.desc}</span>
                <ArrowRight aria-hidden className="mk-related-arrow size-4" />
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section className="marketing-closing-band" aria-label="Get started">
        <div className="flex flex-col items-center gap-8 text-center" data-cta-placement="closing">
          <SectionHeader
            title="Evaluate CiteLadder with your own questions."
            lead="Bring a small prompt portfolio and the reporting questions your team needs to answer."
            align="center"
          />
          <div className="flex flex-wrap justify-center gap-3">
            <DemoButtonLink size="marketing">{DEMO_CTA}</DemoButtonLink>
            <ButtonLink href="/faq" variant="soft" size="marketing">
              Read the FAQ
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
