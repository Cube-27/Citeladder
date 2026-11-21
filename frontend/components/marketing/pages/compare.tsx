import { Callout } from '@/components/ui/callout';
import { TextLink } from '@/components/ui/text-link';
import { COMPARISON_CHECKLIST, COMPETITORS } from '@/lib/marketing-content/compare';

import { SiteActions } from '../primitives/button';
import { RelatedCards } from '../sections/cards';
import { Bento, FeatureCard } from '../sections/features';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { CtaBand, FaqList } from '../sections/steps-faq-cta';

const GUIDES = [
  {
    href: '/compare/profound-alternatives',
    title: 'Profound alternatives',
    desc: 'Hosted and open-source options, compared by workflow and price.',
  },
  {
    href: '/open-source',
    title: 'Open source and self-hosted',
    desc: 'Run CiteLadder yourself under AGPL-3.0, or use the hosted version.',
  },
  {
    href: '/best-ai-visibility-platforms',
    title: 'Seven-platform research comparison',
    desc: 'A wider look at AI visibility platforms.',
  },
  {
    href: '/llm-rank-tracker',
    title: 'LLM rank tracker',
    desc: 'How brand position inside AI answers is measured.',
  },
  {
    href: '/enterprise',
    title: 'Enterprise AEO',
    desc: 'Evidence your security team can inspect, with public scoring code.',
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
    href: '/platform/cited-sources',
    title: 'Cited Sources',
    desc: 'Inspect the domains and URLs your tracked answers cite.',
  },
] as const;

export function CompareIndex() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Compare' }]}
        title="Compare AI visibility software around your workflow"
        lead="Start with the questions your team needs to answer and the evidence it needs to inspect. Each comparison summarizes a product's public positioning and links to its official source."
      />

      <PageSection spacing="compact" label="Comparisons" labelHeading>
        <Callout tone="neutral">
          <span className="block max-w-[72ch]">
            Published by CiteLadder. These are vendor-authored comparisons, not independent
            rankings. Product scope, plans and availability can change; use the linked official
            sources when evaluating a purchase.
          </span>
        </Callout>
        {COMPETITORS.length === 0 ? (
          <p className="cl-body">Comparison notes publish as each vendor review completes.</p>
        ) : (
          <Bento
            cells={COMPETITORS.map((competitor) => ({
              key: competitor.slug,
              span: 6,
              content: (
                <FeatureCard
                  size="lg"
                  href={`/compare/${competitor.slug}`}
                  linkLabel={`Compare with ${competitor.name}`}
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
        action={
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
        <RelatedCards
          layout="columns"
          items={GUIDES.map(({ href, title, desc }) => ({ href, title, body: desc }))}
        />
      </PageSection>

      <PageSection label="Get started">
        <CtaBand
          title="Evaluate CiteLadder with your own questions"
          lead="Bring a small prompt portfolio and the reporting questions your team needs to answer."
          actions={<SiteActions />}
        />
      </PageSection>
    </>
  );
}
