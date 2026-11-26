import { ConnectStrip } from '@/components/mcp/connect-strip';
import { docsHref } from '@/lib/config/docs';
import { PLATFORM_GROUPS, platformLabel } from '@/lib/marketing-content/nav';
import { PLATFORM_GUIDES } from '@/lib/marketing-content/platform-guides';
import type {
  PlatformCta,
  PlatformPage,
  PlatformScreen,
} from '@/lib/marketing-content/platform-pages';

import { ButtonLink, DemoButtonLink, SiteActions } from '../primitives/button';
import { EngineStrip, QuestionCards, RelatedCards } from '../sections/cards';
import { Bento, FeatureCard, FeatureSplit, type BentoSpan } from '../sections/features';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { CheckList, SiteArrowLink, columnsFor } from '../sections/site-parts';
import { CtaBand, FaqList, Steps } from '../sections/steps-faq-cta';
import { CatalogFrame, SCREEN_CATALOG } from '../screens/screen-catalog';

export function PlatformActions({ cta }: Readonly<{ cta: PlatformCta }>) {
  if (cta !== 'mcp') return <SiteActions />;
  return (
    <>
      <ButtonLink href={docsHref('/mcp/')}>Read the MCP docs</ButtonLink>
      <DemoButtonLink variant="soft" />
    </>
  );
}

type Feature = PlatformPage['features'][number];
type ScreenedFeature = Readonly<{ feature: Feature; screen: PlatformScreen }>;

type FeatureGroup =
  | { kind: 'splits'; items: ScreenedFeature[] }
  | { kind: 'cards'; features: Feature[] }
  | { kind: 'full'; item: ScreenedFeature };

function featureLayout(media: Feature['media']): Feature['media']['kind'] {
  if (media.kind === 'full' && SCREEN_CATALOG[media.screen].fit === 'fluid') return 'split';
  return media.kind;
}

function pushSplit(groups: FeatureGroup[], item: ScreenedFeature) {
  const last = groups.at(-1);
  if (last?.kind === 'splits') last.items.push(item);
  else groups.push({ kind: 'splits', items: [item] });
}

function pushCard(groups: FeatureGroup[], feature: Feature) {
  const last = groups.at(-1);
  if (last?.kind === 'cards') last.features.push(feature);
  else groups.push({ kind: 'cards', features: [feature] });
}

function groupFeatures(features: readonly Feature[]): FeatureGroup[] {
  const groups: FeatureGroup[] = [];
  for (const feature of features) {
    const { media } = feature;
    switch (media.kind) {
      case 'full':
        if (featureLayout(media) === 'split') pushSplit(groups, { feature, screen: media.screen });
        else groups.push({ kind: 'full', item: { feature, screen: media.screen } });
        break;
      case 'split':
        pushSplit(groups, { feature, screen: media.screen });
        break;
      case 'card':
        pushCard(groups, feature);
        break;
      default: {
        const exhaustive: never = media;
        return exhaustive;
      }
    }
  }
  return groups;
}

function cardSpans(count: number): readonly BentoSpan[] {
  if (count === 1) return [12];
  if (count === 2) return [6, 6];
  if (count === 3) return [4, 4, 4];
  if (count === 4) return [7, 5, 5, 7];
  return Array.from({ length: count }, (): BentoSpan => 6);
}

function FeatureCards({ features }: Readonly<{ features: readonly Feature[] }>) {
  const spans = cardSpans(features.length);
  const wide = features.length === 1;
  return (
    <Bento
      cells={features.map((feature, index) => ({
        key: feature.title,
        span: spans[index] ?? 6,
        content: (
          <FeatureCard
            size="lg"
            wide={wide}
            text="lead"
            title={feature.title}
            body={feature.body}
            points={feature.points}
          />
        ),
      }))}
    />
  );
}

function Features({ page }: Readonly<{ page: PlatformPage }>) {
  const cardsHeading = `${platformLabel(page.path) ?? 'Platform'} features`;
  const splitSide = new Map(
    page.features
      .filter((feature) => featureLayout(feature.media) === 'split')
      .map((feature, index) => [feature.title, index % 2 === 1]),
  );
  return (
    <>
      {groupFeatures(page.features).map((group) => {
        switch (group.kind) {
          case 'full': {
            const { feature, screen } = group.item;
            return (
              <PageSection
                key={feature.title}
                title={feature.title}
                lead={feature.body}
                action={<CheckList items={feature.points} />}
              >
                <CatalogFrame screen={screen} />
              </PageSection>
            );
          }
          case 'splits':
            return (
              <PageSection
                key={group.items[0]?.feature.title}
                label={group.items[0]?.feature.title}
              >
                {group.items.map(({ feature, screen }) => (
                  <FeatureSplit
                    key={feature.title}
                    as="h2"
                    title={feature.title}
                    body={feature.body}
                    points={feature.points}
                    reverse={splitSide.get(feature.title) === true}
                    media={<CatalogFrame screen={screen} />}
                  />
                ))}
              </PageSection>
            );
          case 'cards':
            return (
              <PageSection key={group.features[0]?.title} label={cardsHeading} labelHeading>
                <FeatureCards features={group.features} />
              </PageSection>
            );
          default: {
            const exhaustive: never = group;
            return exhaustive;
          }
        }
      })}
    </>
  );
}

function Related({ page }: Readonly<{ page: PlatformPage }>) {
  const items = page.related.flatMap((href) => {
    const product = PLATFORM_GROUPS.flatMap((group) => group.items).find(
      (item) => item.href === href,
    );
    const entry = product ?? PLATFORM_GUIDES[href];
    return entry ? [{ href, title: entry.title, body: entry.desc }] : [];
  });
  if (!items.length) return null;
  return (
    <PageSection title="Keep exploring">
      <RelatedCards items={items} layout="columns" />
      {page.cta === 'mcp' && (
        <SiteArrowLink href={docsHref('/mcp/')}>MCP setup and tool reference</SiteArrowLink>
      )}
    </PageSection>
  );
}

export function PlatformPageContent({ page }: Readonly<{ page: PlatformPage }>) {
  const label = platformLabel(page.path) ?? 'Platform';
  return (
    <>
      <PageHero
        size="2xl"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Platform' }, { label }]}
        title={page.heading}
        lead={page.lead}
        actions={
          page.cta === 'mcp' ? (
            <div className="bg-surface text-ink rounded-card w-fit max-w-full border border-transparent p-[var(--card-padding)]">
              <ConnectStrip />
            </div>
          ) : (
            <PlatformActions cta={page.cta} />
          )
        }
        meta={page.note}
      >
        <CatalogFrame screen={page.screen} />
      </PageHero>

      <PageSection spacing="compact" label="Engines">
        <EngineStrip />
      </PageSection>

      <PageSection spacing="compact" label={`${label} highlights`} labelHeading>
        <ul className={`cl-tiles cl-tiles--rows cl-cols-${columnsFor(page.highlights.length)}`}>
          {page.highlights.map((highlight) => (
            <li key={highlight.title}>
              <FeatureCard title={highlight.title} body={highlight.body} />
            </li>
          ))}
        </ul>
      </PageSection>

      <Features page={page} />

      <PageSection title="How it works">
        <Steps items={page.steps} />
      </PageSection>

      <PageSection
        title="Questions you can answer"
        lead="CiteLadder answers each one from the AI answers and site data it has recorded."
      >
        <QuestionCards questions={page.questions} />
      </PageSection>

      <PageSection id="faq" title="Frequently asked questions" layout="aside">
        <FaqList items={page.faqs.map((faq) => ({ question: faq.q, answer: faq.a }))} exclusive />
      </PageSection>

      <Related page={page} />

      <PageSection label="Get started">
        <CtaBand title={page.closing} actions={<PlatformActions cta={page.cta} />} />
      </PageSection>
    </>
  );
}
