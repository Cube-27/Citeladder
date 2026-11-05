import type { ReactNode } from 'react';

import { EngineMark } from '@/components/ui/engine-mark';
import { appHref } from '@/lib/config/app-link';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { NAV_DROPS, platformLabel } from '@/lib/marketing-content/nav';

import { AnnouncementPill } from '../chrome/announcement-pill';
import { CapabilityGrid } from '../pages/platform';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { EngineStrip, LogoTile } from '../sections/cards';
import { Bento, FeatureCard, FeatureSplit } from '../sections/features';
import { LandingHero } from '../sections/heroes';
import { PageHighlight } from '../sections/page-highlight';
import { PageSection } from '../sections/page-section';
import { SiteArrowLink, columnsFor } from '../sections/site-parts';
import { CtaBand, FaqList } from '../sections/steps-faq-cta';
import { ProductFrame } from '../screens/product-frame';
import { ScreenAgentBrief, ScreenAgentChat } from '../screens/screens-agent';
import { ScreenEngines, ScreenKeywords } from '../screens/screens-search';
import { ScreenCrawlerAccess, ScreenSiteHealth } from '../screens/screens-site';
import { ScreenAnswer, ScreenSources, ScreenVisibility } from '../screens/screens-visibility';

import { FAQS, INTEGRATIONS, type IntegrationMark } from './landing-data';
import { EngineRotor } from './landing-rotor';

function PrimaryActions() {
  const signup = selfServeSignupOpen();
  return (
    <>
      {signup ? (
        <ButtonLink href={appHref('/register')} size="marketing">
          Start free trial
        </ButtonLink>
      ) : null}
      <DemoButtonLink variant={signup ? 'soft' : 'primary'} size="marketing" />
    </>
  );
}

function Hero({ rotor }: Readonly<{ rotor?: ReactNode }>) {
  return (
    <LandingHero
      announcement={
        <AnnouncementPill href="/platform/mcp" tag="New">
          Connect CiteLadder to Claude, ChatGPT and more
        </AnnouncementPill>
      }
      title={
        <>
          See whether AI recommends you,{' '}
          <span className="cl-mark">and what to fix when it does not</span>
        </>
      }
      lead={
        <>
          <span className="sr-only">
            CiteLadder is the tool you use when you want ChatGPT, Gemini, Claude and Google AI
            Overviews to recommend your business
          </span>
          <span aria-hidden>
            CiteLadder is the tool you use when you want {rotor ?? <EngineRotor />} and Google AI
            Overviews to recommend your business
          </span>
          . It shows who each answer names and cites, and what to fix on your site.
        </>
      }
      actions={<PrimaryActions />}
      note={
        selfServeSignupOpen() ? '7-day free trial on ChatGPT answers. Trial limits apply.' : null
      }
      frame={
        <ProductFrame aspect="hero" inset={48} label="AI Visibility">
          <ScreenVisibility />
        </ProductFrame>
      }
    />
  );
}

/** The four bento tiles: each links to its module and shows that module's screen. */
const LOOP_TILES = [
  {
    key: 'named',
    span: 7,
    title: 'Track how often you are named',
    body: 'Mention rate, position and competitors for each prompt.',
    href: '/platform/ai-visibility',
    label: 'AI Visibility by engine',
    aspect: 'wide',
    screen: <ScreenEngines />,
  },
  {
    key: 'cited',
    span: 5,
    title: 'See which pages get cited',
    body: 'Every cited URL, labelled owned, review, editorial, community or competitor.',
    href: '/platform/cited-sources',
    label: 'Sources',
    aspect: 'standard',
    screen: <ScreenSources />,
  },
  {
    key: 'checked',
    span: 5,
    title: 'Check each page for problems',
    body: 'Technical and answer-readiness checks, plus which AI crawlers you allow.',
    href: '/platform/site-health',
    label: 'Site Health',
    aspect: 'standard',
    screen: <ScreenSiteHealth />,
  },
  {
    key: 'drafts',
    span: 7,
    title: 'Get drafts your team can review',
    body: 'The Agent drafts briefs and page edits from your evidence. You publish them.',
    href: '/platform/agents',
    label: 'Agent · Content brief',
    aspect: 'wide',
    screen: <ScreenAgentBrief />,
  },
] as const;

function Loop() {
  return (
    <PageSection
      id="how-it-works"
      title="Measure the answer, then fix the page"
      lead="Run your buyers' questions, fix what the answers show, then run them again."
    >
      <Bento
        cells={LOOP_TILES.map((tile) => ({
          key: tile.key,
          span: tile.span,
          content: (
            <FeatureCard
              href={tile.href}
              title={tile.title}
              body={tile.body}
              media={
                <ProductFrame aspect={tile.aspect} label={tile.label}>
                  {tile.screen}
                </ProductFrame>
              }
            />
          ),
        }))}
      />
    </PageSection>
  );
}

type Pillar = Readonly<{
  stage: string;
  title: string;
  body: string;
  points: readonly string[];
  /** Platform routes; each link takes its module's published name. */
  modules: readonly string[];
  shot: string;
  screen: ReactNode;
}>;

const PILLARS: readonly Pillar[] = [
  {
    stage: 'Measure',
    title: 'See how often AI recommends you and who it cites',
    body: 'Each score opens the saved answer: engine, prompt, date, your position and its sources.',
    points: [
      'Competitors on the same prompts',
      'Mentions, citations and AI referral visits counted apart',
      'Product answers for ecommerce teams',
    ],
    modules: [
      '/platform/ai-visibility',
      '/platform/cited-sources',
      '/platform/ai-referral-analytics',
      '/platform/product-visibility',
    ],
    shot: 'Answer record',
    screen: <ScreenAnswer />,
  },
  {
    stage: 'Diagnose · Keyword Research',
    title: 'Compare your keywords and backlinks with competitors',
    body: 'Find keywords competitors rank for that you miss, and sites that link to them but not to you.',
    points: [
      'Keyword gaps and competitor rankings',
      'Referring-domain overlap',
      'Competitors and their top pages',
      'Cost shown before each request',
    ],
    modules: ['/platform/keyword-research', '/platform/search-demand'],
    shot: 'Keyword Research',
    screen: <ScreenKeywords />,
  },
  {
    stage: 'Diagnose · Site Health and Search Demand',
    title: 'Find site issues and queries close to page one',
    body: 'Site Health lists issues per page and which AI crawlers robots.txt lets in. Search Console adds queries at an average position of 4 to 15.',
    points: [
      'AI crawler access for search, training and user fetch',
      'CTR gaps per landing page',
      'Coverage next to every score',
    ],
    modules: ['/platform/site-health', '/platform/search-demand'],
    shot: 'Site Health · AI crawlers',
    screen: <ScreenCrawlerAccess />,
  },
  {
    stage: 'Improve',
    title: 'Draft the fixes, then measure again',
    body: 'The Agent writes briefs, page edits and outreach plans from your saved evidence. Your own assistant can read it over MCP.',
    points: [
      'Briefs for prompts that skip you',
      'Page edits with their reasons',
      'Re-run prompts to check the change',
    ],
    modules: ['/platform/content-briefs', '/platform/agents', '/platform/mcp'],
    shot: 'Agent',
    screen: <ScreenAgentChat />,
  },
];

function Pillars() {
  return (
    <PageSection id="pillars" title="Measure, diagnose, improve">
      {PILLARS.map((pillar, index) => (
        <FeatureSplit
          key={pillar.title}
          eyebrow={pillar.stage}
          title={pillar.title}
          body={pillar.body}
          points={pillar.points}
          links={pillar.modules.map((href) => ({ href, label: platformLabel(href) ?? href }))}
          reverse={index % 2 === 1}
          media={<ProductFrame label={pillar.shot}>{pillar.screen}</ProductFrame>}
        />
      ))}
    </PageSection>
  );
}

/** The source's own logo: brand marks the site already draws, or a logo file. */
function IntegrationLogo({ mark }: Readonly<{ mark: IntegrationMark }>) {
  switch (mark.kind) {
    case 'engines':
      return (
        <span className="cl-logo-group">
          {mark.engines.map((engine) => (
            <EngineMark key={engine} engine={engine} className="size-7" />
          ))}
        </span>
      );
    case 'image':
      return (
        <img
          src={mark.src}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          decoding="async"
          className="size-7"
        />
      );
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

function Integrations() {
  return (
    <PageSection
      id="integrations"
      title="Connect the data you already have"
      lead="Start with AI answers. Add other sources when you need them."
      action={<SiteArrowLink href="/platform/integrations">Explore integrations</SiteArrowLink>}
      layout="aside"
    >
      <ul className="cl-tiles cl-cols-3">
        {INTEGRATIONS.map((integration) => (
          <li key={integration.title}>
            <LogoTile
              name={integration.title}
              caption={integration.body}
              logo={<IntegrationLogo mark={integration.mark} />}
            />
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

function Teams() {
  const solutions = NAV_DROPS.find((drop) => drop.key === 'solutions')?.groups[0]?.items ?? [];
  return (
    <PageSection
      id="teams"
      title="Who uses CiteLadder"
      headerLayout="split"
      action={<SiteArrowLink href="/solutions">Explore solutions</SiteArrowLink>}
    >
      <ul className={`cl-tiles cl-cols-${columnsFor(solutions.length)}`}>
        {solutions.map((item) => (
          <li key={item.href}>
            <FeatureCard href={item.href} title={item.title} body={item.desc} />
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

const TRUST = [
  ['Workspace isolation', 'Each read and write is checked against its workspace.'],
  ['Encrypted credentials', 'Provider keys and connections are stored encrypted.'],
  ['Evidence you can audit', 'Raw answers and crawls are never overwritten.'],
  ['You approve changes', 'CiteLadder does not publish or edit your site on its own.'],
] as const;

function Trust() {
  return (
    <PageSection
      id="trust"
      title="How CiteLadder handles your data"
      action={<SiteArrowLink href="/enterprise">Enterprise</SiteArrowLink>}
      layout="aside"
    >
      <ul className="cl-tiles cl-cols-2">
        {TRUST.map(([title, body]) => (
          <li key={title}>
            <FeatureCard title={title} body={body} />
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

/**
 * Server-rendered; `rotor` is the lead's hydrated engine rotor (see
 * `EngineRotor`). Without it the lead renders its static first engine.
 */
export function LandingPage({ rotor }: Readonly<{ rotor?: ReactNode }>) {
  return (
    <>
      <Hero rotor={rotor} />
      <PageSection label="Monitored answer engines" spacing="compact">
        <EngineStrip
          engines={['chatgpt', 'gemini', 'claude', 'google']}
          names={{ chatgpt: 'OpenAI API', gemini: 'Gemini API', claude: 'Claude API' }}
        />
      </PageSection>
      <PageSection label="What CiteLadder does">
        <PageHighlight
          as="h2"
          title="Buyers ask AI which business to pick"
          body="CiteLadder shows whether the answer names you and which pages it cites."
        />
      </PageSection>
      <Loop />
      <PageSection
        id="platform"
        title="Everything in one project"
        headerLayout="split"
        action={<SiteArrowLink href="/platform">See the whole platform</SiteArrowLink>}
      >
        <CapabilityGrid />
      </PageSection>
      <Pillars />
      <Integrations />
      <Teams />
      <Trust />
      <PageSection
        id="landing-faq"
        title="Questions, answered"
        action={<SiteArrowLink href="/faq">All questions</SiteArrowLink>}
        layout="aside"
      >
        <FaqList items={FAQS.map((faq) => ({ question: faq.q, answer: faq.a }))} />
      </PageSection>
      <PageSection id="get-started">
        <CtaBand
          title="See what AI says about you today"
          lead="Add your site and your buyers' questions to get a first baseline."
          actions={<PrimaryActions />}
        />
      </PageSection>
    </>
  );
}
