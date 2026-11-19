import { ConnectStrip } from '@/components/mcp/connect-strip';
import { docsHref } from '@/lib/config/docs';
import { cn } from '@/lib/utils';
import '../chrome/mega-menu.css';
import { PLATFORM_GROUPS, PLATFORM_OVERVIEW, platformLabel } from '@/lib/marketing-content/nav';
import { PLATFORM_GUIDES } from '@/lib/marketing-content/platform-guides';
import type {
  PlatformCta,
  PlatformPage,
  PlatformScreen,
} from '@/lib/marketing-content/platform-pages';

import { NavIcon, hasNavIcon } from '../chrome/nav-icons';
import { ButtonLink, DemoButtonLink, SiteActions } from '../primitives/button';
import { EngineStrip, QuestionCards, RelatedCards } from '../sections/cards';
import { Bento, FeatureCard, FeatureSplit, type BentoSpan } from '../sections/features';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { CheckList, SiteArrowLink, columnsFor } from '../sections/site-parts';
import { CtaBand, FaqList, Steps } from '../sections/steps-faq-cta';
import { CatalogFrame, SCREEN_CATALOG } from '../screens/screen-catalog';

/**
 * The page's actions: the site's one pair (SiteActions), except on the MCP
 * page, whose primary is its setup guide.
 */
export function PlatformActions({ cta }: Readonly<{ cta: PlatformCta }>) {
  if (cta !== 'mcp') return <SiteActions />;
  return (
    <>
      <ButtonLink href={docsHref('/mcp/')} size="marketing">
        Read the MCP docs
      </ButtonLink>
      <DemoButtonLink variant="soft" size="marketing" />
    </>
  );
}

/** Every published capability, one card per navigation group. */
function CapabilityGrid() {
  return (
    <ul className={cn('cl-tiles', `cl-cols-${columnsFor(PLATFORM_GROUPS.length)}`)}>
      {PLATFORM_GROUPS.map((group) => (
        <li key={group.label}>
          <div className="cl-fcard">
            <div className="cl-fcard-body">
              <h3 className="cl-fcard-title">{group.label}</h3>
              <ul className="grid w-full gap-1">
                {group.items.map((item) => {
                  const icon = hasNavIcon(item.href);
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className={cn('cl-mega-item focus-ring', !icon && 'cl-mega-item--text')}
                      >
                        {icon && (
                          <span className="cl-mega-icon" aria-hidden>
                            <NavIcon href={item.href} className="size-5" />
                          </span>
                        )}
                        <span className="cl-mega-copy">
                          <span className="cl-mega-title">{item.title}</span>
                          <span className="cl-mega-desc">{item.desc}</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

type Feature = PlatformPage['features'][number];
type ScreenedFeature = Readonly<{ feature: Feature; screen: PlatformScreen }>;

/** Features in page order, consecutive splits and consecutive cards kept together. */
type FeatureGroup =
  | { kind: 'splits'; items: ScreenedFeature[] }
  | { kind: 'cards'; features: Feature[] }
  | { kind: 'full'; item: ScreenedFeature };

/**
 * How a feature's screen is laid out: a full app screen keeps the full width;
 * a vignette asked to go full width sits beside its copy as a split, so a
 * card image is never stretched across the page.
 */
function featureLayout(media: Feature['media']): Feature['media']['kind'] {
  if (media.kind === 'full' && SCREEN_CATALOG[media.screen].fit === 'fluid') return 'split';
  return media.kind;
}

/** Adds a split to the run of splits it follows, or starts one. */
function pushSplit(groups: FeatureGroup[], item: ScreenedFeature) {
  const last = groups.at(-1);
  if (last?.kind === 'splits') last.items.push(item);
  else groups.push({ kind: 'splits', items: [item] });
}

/** Adds a card to the row of cards it follows, or starts one. */
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

/** A row of cards keeps the system's bento rhythm: 12, halves, thirds, 7 + 5 / 5 + 7. */
function cardSpans(count: number): readonly BentoSpan[] {
  if (count === 1) return [12];
  if (count === 2) return [6, 6];
  if (count === 3) return [4, 4, 4];
  if (count === 4) return [7, 5, 5, 7];
  return Array.from({ length: count }, (): BentoSpan => 6);
}

function FeatureCards({ features }: Readonly<{ features: readonly Feature[] }>) {
  const spans = cardSpans(features.length);
  // A card alone in its row spreads its copy and points across the width.
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

/**
 * The features, in order: splits alternate sides across the whole page, a
 * full-width screen heads its own section, and cards share a bento row.
 */
function Features({ page }: Readonly<{ page: PlatformPage }>) {
  // A card row's visually hidden h2 names the product, never a card's own title.
  const cardsHeading = `${platformLabel(page.path) ?? 'Platform'} features`;
  // Splits alternate across the whole page, not per section.
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
            // Title, copy and points stack together over the screen.
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
    const entry =
      product ??
      (href === PLATFORM_OVERVIEW.href
        ? { title: PLATFORM_OVERVIEW.title, desc: PLATFORM_OVERVIEW.desc }
        : PLATFORM_GUIDES[href]);
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

/**
 * One template for /platform and every capability page: the hero and its
 * screen, the engines, the highlights, the features, how it works, the
 * questions it answers, FAQ, related pages and the closing band.
 */
export function PlatformPageContent({ page }: Readonly<{ page: PlatformPage }>) {
  const overview = page.path === PLATFORM_OVERVIEW.href;
  const label = platformLabel(page.path) ?? 'Platform';
  return (
    <>
      <PageHero
        size="2xl"
        crumbs={
          overview
            ? [{ label: 'Home', href: '/' }, { label: 'Platform' }]
            : [
                { label: 'Home', href: '/' },
                { label: 'Platform', href: PLATFORM_OVERVIEW.href },
                { label },
              ]
        }
        title={page.heading}
        lead={page.lead}
        // Connecting an assistant is the MCP hero's whole action; its closing band keeps the guide and a demo.
        actions={page.cta === 'mcp' ? <ConnectStrip /> : <PlatformActions cta={page.cta} />}
        meta={page.note}
      >
        {/* The page's one product image: a full app screen fills the width, a vignette centres. */}
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

      {overview && (
        <PageSection
          id="capabilities"
          title="What a project includes"
          lead="Every project starts with AI visibility. Add the rest when you have a question it cannot answer."
        >
          <CapabilityGrid />
        </PageSection>
      )}

      <PageSection id="faq" title="Frequently asked questions" layout="aside">
        <FaqList items={page.faqs.map((faq) => ({ question: faq.q, answer: faq.a }))} exclusive />
      </PageSection>

      {!overview && <Related page={page} />}

      <PageSection label="Get started">
        <CtaBand title={page.closing} actions={<PlatformActions cta={page.cta} />} />
      </PageSection>
    </>
  );
}
