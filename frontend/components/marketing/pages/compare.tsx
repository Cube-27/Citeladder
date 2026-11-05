import { Callout } from '@/components/ui/callout';
import { TextLink } from '@/components/ui/text-link';
import { COMPARISON_CHECKLIST, COMPETITORS } from '@/lib/marketing-content/compare';
import { DEMO_CTA } from '@/lib/marketing-content/nav';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { RelatedCards } from '../sections/cards';
import { Bento, FeatureCard, type BentoSpan } from '../sections/features';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { CtaBand, FaqList } from '../sections/steps-faq-cta';

/** Related reading: CiteLadder's own guides and product pages. */
const GUIDES = [
  {
    href: '/compare/profound-alternatives',
    title: 'Profound alternatives',
    body: 'Hosted and open-source options, compared by workflow and price.',
  },
  {
    href: '/open-source',
    title: 'Open source and self-hosted',
    body: 'Run CiteLadder yourself under AGPL-3.0, or use the hosted version.',
  },
  {
    href: '/best-ai-visibility-platforms',
    title: 'Seven-platform research comparison',
    body: 'A wider look at AI visibility platforms.',
  },
  {
    href: '/llm-rank-tracker',
    title: 'LLM rank tracker',
    body: 'How brand position inside AI answers is measured.',
  },
  {
    href: '/enterprise',
    title: 'Enterprise AEO',
    body: 'Evidence your security team can inspect, with public scoring code.',
  },
  {
    href: '/ai-citation-tracking',
    title: 'AI citation tracking',
    body: 'How citation measurement works and how to read it.',
  },
  {
    href: '/ai-search-share-of-voice',
    title: 'AI share of voice',
    body: 'What a share-of-voice percentage actually counts.',
  },
  {
    href: '/platform/cited-sources',
    title: 'Cited Sources',
    body: 'Inspect the domains and URLs your tracked answers cite.',
  },
] as const;

/** Vendor tiles keep the bento rhythm: 7 + 5, then 5 + 7. */
const VENDOR_SPANS: readonly BentoSpan[] = [7, 5, 5, 7];

/**
 * `/compare`: the comparison index. Each vendor is a linked card with its
 * public positioning, followed by the shared evaluation questions and
 * related guides. A vendor disclosure sits under the heading.
 */
export function CompareIndex() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Compare' }]}
        title="Compare AI visibility software around your workflow"
        lead="Start with the questions your team needs to answer and the evidence it needs to inspect. Each comparison summarizes a product's public positioning and links to its official source."
      />

      <PageSection spacing="compact" label="Comparisons">
        <Callout tone="neutral" className="mb-6">
          Published by CiteLadder. These are vendor-authored comparisons, not independent rankings.
          Product scope, plans and availability can change; use the linked official sources when
          evaluating a purchase.
        </Callout>
        {COMPETITORS.length === 0 ? (
          <p className="cl-body">Comparison notes publish as each vendor review completes.</p>
        ) : (
          <Bento
            cells={COMPETITORS.map((competitor, index) => ({
              key: competitor.slug,
              span: VENDOR_SPANS[index % VENDOR_SPANS.length] ?? 6,
              content: (
                <FeatureCard
                  size="lg"
                  href={`/compare/${competitor.slug}`}
                  title={`CiteLadder vs ${competitor.name}`}
                  body={competitor.tagline}
                />
              ),
            }))}
          />
        )}
      </PageSection>

      <PageSection
        id="checklist"
        layout="aside"
        title="Agree on the measurement before comparing the score"
        lead="Ask each vendor what it observes, how it selects prompts, what it counts and how you can inspect the evidence."
        aside={
          <p className="cl-body">
            Read{' '}
            <TextLink asChild text="inherit">
              <a href="/blog/verify-improve-ai-search-visibility">how to measure AI visibility</a>
            </TextLink>{' '}
            and{' '}
            <TextLink asChild text="inherit">
              <a href="/blog/action-playbook-winning-ai-citations">how to investigate citations</a>
            </TextLink>
            {'.'}
          </p>
        }
      >
        <FaqList
          items={COMPARISON_CHECKLIST.map((item) => ({
            question: item.heading,
            answer: item.body,
          }))}
        />
      </PageSection>

      <PageSection title="Related guides">
        <RelatedCards items={GUIDES} />
      </PageSection>

      <PageSection label="Get started">
        <CtaBand
          title="Evaluate CiteLadder with your own questions"
          lead="Bring a small prompt portfolio and the reporting questions your team needs to answer."
          actions={
            <>
              <DemoButtonLink size="marketing">{DEMO_CTA}</DemoButtonLink>
              <ButtonLink href="/faq" variant="soft" size="marketing">
                Read the FAQ
              </ButtonLink>
            </>
          }
        />
      </PageSection>
    </>
  );
}
