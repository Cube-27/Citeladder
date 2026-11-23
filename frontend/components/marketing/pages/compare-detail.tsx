import { Callout } from '@/components/ui/callout';
import { TextLink } from '@/components/ui/text-link';
import { formatSiteDate } from '@/lib/marketing-content/site-date';
import {
  CITELADDER_POSITION,
  COMPARISON_CHECKLIST,
  COMPARISON_DISCLOSURE,
  type Competitor,
} from '@/lib/marketing-content/compare';

import { SiteActions } from '../primitives/button';
import { RelatedCards } from '../sections/cards';
import { FeatureSplit } from '../sections/features';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { PricingTable } from '../sections/pricing';
import { CtaBand, FaqList } from '../sections/steps-faq-cta';
import { CatalogFrame } from '../screens/screen-catalog';

const FURTHER_READING = [
  { href: '/compare/profound-alternatives', title: 'Profound alternatives' },
  { href: '/best-ai-visibility-platforms', title: 'AI visibility platforms compared' },
  { href: '/platform/ai-visibility', title: 'AI visibility tracker' },
  { href: '/pricing', title: 'CiteLadder pricing' },
  { href: '/platform/cited-sources', title: 'Cited Sources' },
  { href: '/ai-search-share-of-voice', title: 'AI share of voice' },
] as const;

function SourceLink({ source }: Readonly<{ source: Competitor['sources'][number] }>) {
  return (
    <TextLink asChild text="inherit">
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-6 items-center"
      >
        {source.label}
      </a>
    </TextLink>
  );
}

export function CompareDetailView({ competitor }: Readonly<{ competitor: Competitor }>) {
  const [source] = competitor.sources;
  return (
    <>
      <PageHero
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'Compare', href: '/compare' },
          { label: `CiteLadder vs ${competitor.name}` },
        ]}
        title={`CiteLadder vs ${competitor.name}`}
        lead={competitor.lead}
        actions={<SiteActions />}
      />

      <PageSection spacing="compact" title="Side-by-side comparison" lead={competitor.context}>
        <PricingTable
          caption={`CiteLadder and ${competitor.name} compared by public product information`}
          plans={[{ name: 'CiteLadder' }, { name: competitor.name }]}
          groups={[
            {
              rows: [
                {
                  label: 'Product focus',
                  values: [CITELADDER_POSITION.focus, competitor.tagline],
                },
                {
                  label: 'Look closer when',
                  values: [CITELADDER_POSITION.when, competitor.whenBody],
                },
                {
                  label: 'Open source / self-hostable',
                  values: [
                    <>
                      {CITELADDER_POSITION.openSource}{' '}
                      <TextLink asChild text="inherit">
                        <a href="/open-source">Self-host or use the hosted version</a>
                      </TextLink>
                    </>,
                    competitor.openSource,
                  ],
                },
                {
                  label: 'Source',
                  values: [
                    <TextLink key="citeladder" asChild text="inherit">
                      <a href="/">CiteLadder</a>
                    </TextLink>,
                    source ? (
                      <>
                        <SourceLink source={source} />
                        <span className="text-ink-muted">
                          {' '}
                          · reviewed {formatSiteDate(source.reviewedDate)}
                        </span>
                      </>
                    ) : (
                      false
                    ),
                  ],
                },
              ],
            },
          ]}
        />
      </PageSection>

      <PageSection
        id="checklist"
        layout="aside"
        title="Questions to ask both vendors"
        lead="Compare the same use case across vendors rather than one aggregate percentage."
      >
        <FaqList
          items={COMPARISON_CHECKLIST.map((item) => ({
            question: item.heading,
            answer: item.body,
          }))}
        />
      </PageSection>

      <PageSection label="CiteLadder">
        <FeatureSplit
          as="h2"
          title={competitor.conclusionHeading}
          body={[
            competitor.conclusion,
            'In a CiteLadder demo, inspect a recorded answer, follow its cited sources and review the relevant website findings. Confirm the current collection options, plan limits and provider setup for your project.',
          ]}
          media={<CatalogFrame screen="answer" />}
        />
      </PageSection>

      <PageSection spacing="compact" label="Comparison sources and disclosure">
        <Callout tone="neutral">
          {COMPARISON_DISCLOSURE}
          {competitor.sources.map((item) => (
            <span key={item.url}>
              {' '}
              <SourceLink source={item} />
              {'. '}
              <time dateTime={item.reviewedDate}>
                Source reviewed {formatSiteDate(item.reviewedDate)}
              </time>
              .
            </span>
          ))}
        </Callout>
      </PageSection>

      <PageSection title="Related guides">
        <RelatedCards layout="columns" items={FURTHER_READING} />
      </PageSection>

      <PageSection label="Get started">
        <CtaBand
          title="Run the same investigation in both demos"
          lead="Bring a small prompt portfolio and one question your team needs to answer."
          actions={<SiteActions />}
        />
      </PageSection>
    </>
  );
}
