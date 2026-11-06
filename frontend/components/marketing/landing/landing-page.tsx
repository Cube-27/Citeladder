import type { ReactNode } from 'react';

import { EngineMark } from '@/components/ui/engine-mark';
import { appHref } from '@/lib/config/app-link';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { NAV_DROPS, PLATFORM_GROUPS, platformLabel } from '@/lib/marketing-content/nav';

import { AnnouncementPill } from '../chrome/announcement-pill';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { EngineStrip, LogoTile } from '../sections/cards';
import { CardRail, FeatureCard, FeatureSplit } from '../sections/features';
import { LandingHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { SiteArrowLink, columnsFor } from '../sections/site-parts';
import { CtaBand, FaqList, Steps } from '../sections/steps-faq-cta';
import { ProductFrame } from '../screens/product-frame';
import { ScreenAgentBrief, ScreenAgentChat, ScreenCommerce } from '../screens/screens-agent';
import {
  ScreenDemand,
  ScreenEngines,
  ScreenKeywords,
  ScreenReferrals,
} from '../screens/screens-search';
import { ScreenMcp, ScreenSiteHealth } from '../screens/screens-site';
import { ScreenAnswer, ScreenSources } from '../screens/screens-visibility';
import { ScreenAppVisibility } from '../screens/screen-app';

import { FAQS, INTEGRATIONS, type IntegrationMark } from './landing-data';

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

function Hero() {
  return (
    <LandingHero
      announcement={
        <AnnouncementPill href="/platform/mcp" tag="New">
          Connect CiteLadder to Claude, ChatGPT and more
        </AnnouncementPill>
      }
      title="Get your business recommended by AI"
      lead="CiteLadder helps marketing and SEO teams grow their AI visibility, traffic and revenue."
      actions={<PrimaryActions />}
      note={
        selfServeSignupOpen() ? '7-day free trial on ChatGPT answers. Trial limits apply.' : null
      }
      frame={
        // D25: the real app, chrome and all, as the page's first product view.
        <ProductFrame label="The AI Visibility page in the CiteLadder app" fit="scale">
          <ScreenAppVisibility />
        </ProductFrame>
      }
    />
  );
}

/**
 * Each module's one focused screen, by platform route. A published module
 * without a screen here (Integrations, which has its own section) is left out
 * of the rail.
 */
const MODULE_SCREENS: Readonly<Record<string, ReactNode>> = {
  '/platform/ai-visibility': <ScreenEngines />,
  '/platform/cited-sources': <ScreenSources />,
  '/platform/ai-referral-analytics': <ScreenReferrals />,
  '/platform/product-visibility': <ScreenCommerce />,
  '/platform/site-health': <ScreenSiteHealth />,
  '/platform/search-demand': <ScreenDemand />,
  '/platform/keyword-research': <ScreenKeywords />,
  '/platform/content-briefs': <ScreenAgentBrief />,
  '/platform/agents': <ScreenAgentChat />,
  '/platform/mcp': <ScreenMcp />,
};

/** One card per module, in navigation order: its name, its one line and its screen. */
function Modules() {
  const modules = PLATFORM_GROUPS.flatMap((group) => group.items).flatMap((item) => {
    const screen = MODULE_SCREENS[item.href];
    return screen ? [{ ...item, screen }] : [];
  });
  return (
    <PageSection
      id="platform"
      title="Measure the answer, then fix the page"
      action={<SiteArrowLink href="/platform">See the whole platform</SiteArrowLink>}
    >
      <CardRail
        label="modules"
        items={modules.map((module) => ({
          key: module.href,
          content: (
            <FeatureCard
              href={module.href}
              linkLabel={`Explore ${module.title}`}
              title={module.title}
              body={module.desc}
              media={<ProductFrame label={module.title}>{module.screen}</ProductFrame>}
            />
          ),
        }))}
      />
    </PageSection>
  );
}

const STEPS = [
  {
    title: "Run your buyers' questions",
    body: 'Mention rate, position and competitors for each prompt.',
  },
  {
    title: 'Fix what the answers show',
    body: 'The Agent drafts briefs and page edits from your evidence. You publish them.',
  },
  { title: 'Run them again', body: 'Re-run prompts to check the change.' },
] as const;

function HowItWorks() {
  return (
    <PageSection id="how-it-works" title="Measure, diagnose, improve">
      <Steps items={STEPS} />
    </PageSection>
  );
}

/** The one product view after the rail: the saved answer behind every score. */
function Evidence() {
  const modules = [
    '/platform/ai-visibility',
    '/platform/cited-sources',
    '/platform/ai-referral-analytics',
  ];
  return (
    <PageSection id="evidence" label="Evidence">
      <FeatureSplit
        as="h2"
        title="See how often AI recommends you and who it cites"
        body="Each score opens the saved answer: engine, prompt, date, your position and its sources."
        points={[
          'Competitors on the same prompts',
          'Mentions, citations and AI referral visits counted apart',
        ]}
        links={modules.map((href) => ({ href, label: platformLabel(href) ?? href }))}
        media={
          <ProductFrame label="Answer record">
            <ScreenAnswer />
          </ProductFrame>
        }
      />
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
      action={<SiteArrowLink href="/solutions">Explore solutions</SiteArrowLink>}
    >
      <ul className={`cl-tiles cl-cols-${columnsFor(solutions.length)}`}>
        {solutions.map((item) => (
          <li key={item.href}>
            <FeatureCard
              href={item.href}
              linkLabel={`Explore ${item.title}`}
              title={item.title}
              body={item.desc}
            />
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
    >
      <ul className={`cl-tiles cl-cols-${columnsFor(TRUST.length)}`}>
        {TRUST.map(([title, body]) => (
          <li key={title}>
            <FeatureCard title={title} body={body} />
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

/** Server-rendered to static HTML. */
export function LandingPage() {
  return (
    <>
      <Hero />
      <PageSection label="Monitored answer engines" spacing="compact">
        <EngineStrip
          engines={['chatgpt', 'gemini', 'claude', 'google']}
          names={{ chatgpt: 'OpenAI API', gemini: 'Gemini API', claude: 'Claude API' }}
        />
      </PageSection>
      <Modules />
      <HowItWorks />
      <Evidence />
      <Integrations />
      <Teams />
      <Trust />
      <PageSection
        id="landing-faq"
        title="Frequently asked questions"
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
