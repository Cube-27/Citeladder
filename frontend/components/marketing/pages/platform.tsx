import type { ReactNode } from 'react';
import { ArrowRight, Check, ChevronDown, MessageCircleQuestion } from 'lucide-react';

import { appHref } from '@/lib/config/app-link';
import { docsHref } from '@/lib/config/docs';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { PLATFORM_GROUPS, PLATFORM_OVERVIEW, platformLabel } from '@/lib/marketing-content/nav';
import type {
  PlatformCta,
  PlatformPage,
  PlatformVisual,
} from '@/lib/marketing-content/platform-pages';
import { cn } from '@/lib/utils';

import { ConnectStrip } from '@/components/mcp/connect-strip';

import { NavIcon, hasNavIcon } from '../chrome/nav-icons';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';
import {
  AcquisitionView,
  ActionsView,
  AdsView,
  AgentView,
  AnswerView,
  CitedUrlView,
  CommerceView,
  CrawlerView,
  DemandView,
  EarnedSourceView,
  EnginesView,
  IntegrationsView,
  McpToolsView,
  McpView,
  PageEvidenceView,
  PageReportView,
  PerceptionView,
  PillarsView,
  ProductShot,
  PromptsView,
  PropertyMappingView,
  QueryPageView,
  ReferralView,
  RevisionsView,
  SearchView,
  ShelfSetupView,
  SiteHealthView,
  SkillsView,
  SourcesView,
  VisibilityView,
} from '../scenes/product-views';

const VIEWS: Readonly<Record<PlatformVisual, () => ReactNode>> = {
  visibility: VisibilityView,
  answer: AnswerView,
  sources: SourcesView,
  'site-health': SiteHealthView,
  referrals: ReferralView,
  demand: DemandView,
  search: SearchView,
  agent: AgentView,
  commerce: CommerceView,
  mcp: McpView,
  integrations: IntegrationsView,
  actions: ActionsView,
  prompts: PromptsView,
  'cited-url': CitedUrlView,
  'page-evidence': PageEvidenceView,
  'page-report': PageReportView,
  'query-page': QueryPageView,
  acquisition: AcquisitionView,
  revisions: RevisionsView,
  skills: SkillsView,
  'shelf-setup': ShelfSetupView,
  'mcp-tools': McpToolsView,
  'property-mapping': PropertyMappingView,
  perception: PerceptionView,
  ads: AdsView,
  engines: EnginesView,
  crawlers: CrawlerView,
  earned: EarnedSourceView,
  pillars: PillarsView,
};

const VIEW_TITLES: Readonly<Record<PlatformVisual, string>> = {
  visibility: 'AI Visibility',
  answer: 'Answer record',
  sources: 'Sources',
  'site-health': 'Site Health',
  referrals: 'AI Traffic · Referrals',
  demand: 'Search Demand',
  search: 'Search Intelligence',
  agent: 'Agent',
  commerce: 'AI Shelf',
  mcp: 'MCP client',
  integrations: 'Integrations',
  actions: 'Actions',
  prompts: 'Prompts',
  'cited-url': 'Sources · URL',
  'page-evidence': 'Site Health · Page',
  'page-report': 'Page report',
  'query-page': 'Search Demand · Page',
  acquisition: 'Search Intelligence · Review',
  revisions: 'Agent · Output',
  skills: 'Agent · New chat',
  'shelf-setup': 'AI Shelf · Setup',
  'mcp-tools': 'MCP · Tools',
  'property-mapping': 'Integrations · Property',
  perception: 'AI Visibility · Perception',
  ads: 'AI Visibility · Ads',
  engines: 'AI Visibility · Engines',
  crawlers: 'AI Traffic · Crawlers',
  earned: 'Sources · Earned page',
  pillars: 'Site Health · Overview',
};

/** Guides and solution anchors a product page may relate to. */
const GUIDES: Readonly<Record<string, { title: string; desc: string }>> = {
  '/ai-citation-tracking': {
    title: 'AI citation tracking guide',
    desc: 'How citation measurement works and how to read it.',
  },
  '/ai-search-share-of-voice': {
    title: 'AI share of voice',
    desc: 'Compare brand presence across AI answers.',
  },
  '/solutions#commerce': {
    title: 'Ecommerce solutions',
    desc: 'Product and category answer evidence.',
  },
};

/** The page's primary and secondary actions, chosen by what a visitor can do today. */
export function PlatformActions({
  cta,
  size = 'marketing',
}: Readonly<{ cta: PlatformCta; size?: 'lg' | 'marketing' }>) {
  const mcp = cta === 'mcp';
  const trial = cta === 'trial' && selfServeSignupOpen();
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {mcp && (
        <ButtonLink href={docsHref('/mcp/')} size={size}>
          Read the MCP docs
        </ButtonLink>
      )}
      {trial && (
        <ButtonLink href={appHref('/register')} size={size}>
          Start free trial
        </ButtonLink>
      )}
      <DemoButtonLink variant={trial || mcp ? 'soft' : 'primary'} size={size}>
        {cta === 'setup' ? 'Discuss setup' : 'Book a demo'}
      </DemoButtonLink>
      {(cta === 'demo' || cta === 'setup') && (
        <ButtonLink href="/pricing" variant="soft" size={size}>
          See pricing
        </ButtonLink>
      )}
    </div>
  );
}

/** Every published capability, grouped as in the navigation. */
export function CapabilityGrid() {
  return (
    <div className="mk-capabilities">
      {PLATFORM_GROUPS.map((group) => (
        <div key={group.label} className="mk-capability-group">
          <p className="mk-group-label">{group.label}</p>
          <ul>
            {group.items.map((item) => {
              return (
                <li key={item.href}>
                  <a href={item.href} className="mk-capability">
                    {hasNavIcon(item.href) && (
                      <span className="nav-row-icon" aria-hidden>
                        <NavIcon href={item.href} className="size-4" />
                      </span>
                    )}
                    <span>
                      <span className="mk-capability-title">{item.title}</span>
                      <span className="mk-capability-desc">{item.desc}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Shot({ visual, title }: Readonly<{ visual: PlatformVisual; title?: string }>) {
  const View = VIEWS[visual];
  return (
    <ProductShot title={title ?? VIEW_TITLES[visual]}>
      <View />
    </ProductShot>
  );
}

export function FaqList({ faqs }: Readonly<{ faqs: readonly { q: string; a: string }[] }>) {
  return (
    <div className="mk-faq-list">
      {faqs.map((faq) => (
        <details key={faq.q}>
          <summary>
            {faq.q}
            <ChevronDown aria-hidden className="size-4" />
          </summary>
          <p className="website-body">{faq.a}</p>
        </details>
      ))}
    </div>
  );
}

/** One template for /platform and every capability page. */
export function PlatformPageContent({ page }: Readonly<{ page: PlatformPage }>) {
  const overview = page.path === PLATFORM_OVERVIEW.href;
  const label = platformLabel(page.path) ?? 'Platform';
  return (
    <>
      <PageHero
        centered
        title={page.heading}
        lead={page.lead}
        breadcrumb={
          overview
            ? [{ label: 'Platform' }]
            : [{ label: 'Platform', href: PLATFORM_OVERVIEW.href }, { label }]
        }
      >
        <div className="mt-9 grid justify-items-center gap-4" data-cta-placement="hero">
          {/* Connecting an assistant is the MCP hero's whole action; its closing band keeps the guide and a demo. */}
          {page.cta === 'mcp' ? (
            <ConnectStrip className="text-left" />
          ) : (
            <PlatformActions cta={page.cta} />
          )}
          {page.note && <p className="website-label text-muted">{page.note}</p>}
        </div>
      </PageHero>

      <Section rhythm="tight" className="pt-0" aria-label={`${label} preview`}>
        <Shot visual={page.visual} title={page.visualTitle} />
        <ul className="mk-highlights">
          {page.highlights.map((highlight) => (
            <li key={highlight.title}>
              <h2 className="website-feature-heading">{highlight.title}</h2>
              <p className="website-body">{highlight.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {page.features.length > 0 && (
        <Section tone="soft">
          <div className="mk-features">
            {page.features.map((feature, index) => (
              <div
                key={feature.title}
                className={cn('mk-dive', index % 2 === 1 && 'mk-dive-reverse')}
              >
                <div className="mk-dive-copy">
                  <h2 className="website-page-title mk-dive-title">{feature.title}</h2>
                  <p className="website-body">{feature.body}</p>
                  <ul className="mk-checks">
                    {feature.points.map((point) => (
                      <li key={point}>
                        <Check aria-hidden className="size-4" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <Shot visual={feature.visual} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section aria-label="How it works">
        <SectionHeader title="How it works." />
        <ol className="mk-steps">
          {page.steps.map((step, index) => (
            <li key={step.title}>
              <span className="mk-step-number" aria-hidden>
                {index + 1}
              </span>
              <h3 className="website-feature-heading">{step.title}</h3>
              <p className="website-body">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="soft" aria-label="Questions you can answer">
        <SectionHeader
          title="Questions you can answer."
          lead="Asked the way your team asks them, answered from recorded evidence."
        />
        <ul className="mk-questions">
          {page.questions.map((question) => (
            <li key={question}>
              <MessageCircleQuestion aria-hidden className="size-4" />
              {question}
            </li>
          ))}
        </ul>
      </Section>

      {overview && (
        <Section id="capabilities">
          <SectionHeader
            title="Everything in one project."
            lead="Start with AI visibility. Add the capabilities your questions need."
          />
          <CapabilityGrid />
        </Section>
      )}

      <Section tone={overview ? 'soft' : 'paper'}>
        <div className="mk-split">
          <SectionHeader title="Frequently asked questions." />
          <FaqList faqs={page.faqs} />
        </div>
      </Section>

      {!overview && <Related page={page} />}

      <Section className="marketing-closing-band">
        <div className="flex flex-col items-center gap-8 text-center" data-cta-placement="closing">
          <SectionHeader title={page.closing} align="center" />
          <PlatformActions cta={page.cta} />
        </div>
      </Section>
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
        : GUIDES[href]);
    return entry ? [{ href, title: entry.title, desc: entry.desc }] : [];
  });
  if (!items.length) return null;
  return (
    <Section tone="soft" aria-label="Related capabilities and guides">
      <SectionHeader title="Keep exploring." />
      <ul className="mk-related">
        {items.map((item) => {
          return (
            <li key={item.href}>
              <a href={item.href} className="mk-related-card">
                {hasNavIcon(item.href) && (
                  <span className="nav-row-icon" aria-hidden>
                    <NavIcon href={item.href} className="size-4" />
                  </span>
                )}
                <span className="mk-capability-title">{item.title}</span>
                <span className="mk-capability-desc">{item.desc}</span>
                <ArrowRight aria-hidden className="mk-related-arrow size-4" />
              </a>
            </li>
          );
        })}
      </ul>
      {page.path === '/platform/mcp' && (
        <a className="mk-text-link" href={docsHref('/mcp/')}>
          MCP setup and tool reference
          <ArrowRight aria-hidden className="size-4" />
        </a>
      )}
    </Section>
  );
}

const MODULE_VISUALS: Readonly<Record<string, PlatformVisual>> = {
  '/platform/ai-visibility': 'visibility',
  '/platform/citation-intelligence': 'sources',
};

/** A compact product callout for research guides: copy beside one product view. */
export function ProductModule({
  path,
  heading,
  children,
}: Readonly<{ path: string; heading: string; children: ReactNode }>) {
  return (
    <Section tone="soft">
      <div className="mk-dive">
        <div className="mk-dive-copy">
          <h2 className="website-section-heading">{heading}</h2>
          <p className="website-body">{children}</p>
          <a className="mk-text-link" href={path}>
            Explore {platformLabel(path)}
            <ArrowRight aria-hidden className="size-4" />
          </a>
        </div>
        <Shot visual={MODULE_VISUALS[path] ?? 'visibility'} />
      </div>
    </Section>
  );
}
