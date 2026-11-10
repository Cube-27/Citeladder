import {
  Activity,
  Eye,
  FileText,
  Link2,
  Plug,
  Search,
  ShoppingBag,
  Sparkles,
  TextSearch,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

import { EngineMark } from '@/components/ui/engine-mark';
import { appHref } from '@/lib/config/app-link';
import { PUBLIC_TRIAL } from '@/lib/config/public-trial';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { NAV_DROPS, PLATFORM_GROUPS, platformLabel } from '@/lib/marketing-content/nav';
import { PLATFORM_PAGES } from '@/lib/marketing-content/platform-pages';

import { AnnouncementPill } from '../chrome/announcement-pill';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { EngineStrip, LogoTile } from '../sections/cards';
import { CardRail, FeatureCard, FeatureSplit, RailCard } from '../sections/features';
import { LandingHero } from '../sections/heroes';
import { PageSection, SectionHeader } from '../sections/page-section';
import { SiteArrowLink, columnsFor } from '../sections/site-parts';
import { CtaBand, FaqList, Steps } from '../sections/steps-faq-cta';
import { ProductFrame } from '../screens/product-frame';
import { ScreenAppPage, ScreenAppVisibility } from '../screens/screen-app';
import { MODULE_SCREENS, SCREEN_CATALOG, moduleScreen } from '../screens/screen-catalog';
import { CapabilityPanel } from '../sections/capability-panel';

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

/**
 * What each module does, as the hero panel's short statement (D52). Keyed by
 * the module rail's routes, so a module cannot ship without one.
 */
const CAPABILITIES: Readonly<
  Record<keyof typeof MODULE_SCREENS, Readonly<{ text: string; icon: LucideIcon }>>
> = {
  '/platform/ai-visibility': { text: 'Track citations and mentions', icon: Eye },
  '/platform/cited-sources': { text: 'See the sources AI cites', icon: Link2 },
  '/platform/ai-referral-analytics': { text: 'Measure AI referral traffic', icon: TrendingUp },
  '/platform/product-visibility': { text: 'Track product rankings in AI', icon: ShoppingBag },
  '/platform/site-health': { text: 'Audit site health', icon: Activity },
  '/platform/search-demand': { text: 'Find search demand gaps', icon: Search },
  '/platform/keyword-research': { text: 'Keyword research', icon: TextSearch },
  '/platform/content-optimization': { text: 'Optimize content', icon: FileText },
  '/platform/agents': { text: 'Plan work with the AI Agent', icon: Sparkles },
  '/platform/mcp': { text: 'Connect to Claude and ChatGPT', icon: Plug },
};

const isModuleRoute = (href: string): href is keyof typeof MODULE_SCREENS => href in MODULE_SCREENS;

/** The panel's rows, in the module rail's order. */
const CAPABILITY_ROWS = PLATFORM_GROUPS.flatMap((group) => group.items).flatMap((item) =>
  isModuleRoute(item.href) ? [{ href: item.href, ...CAPABILITIES[item.href] }] : [],
);

function Hero() {
  return (
    <LandingHero
      aside={<CapabilityPanel question="What can CiteLadder do?" items={CAPABILITY_ROWS} />}
      announcement={
        <AnnouncementPill href="/platform/mcp" tag="New">
          Connect CiteLadder to Claude, ChatGPT and more
        </AnnouncementPill>
      }
      title="Get your business recommended by AI"
      lead="CiteLadder helps marketing and SEO teams grow their AI visibility, traffic and revenue."
      actions={<PrimaryActions />}
      note={
        selfServeSignupOpen()
          ? `${PUBLIC_TRIAL.days}-day free trial on ChatGPT answers. Trial limits apply.`
          : null
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
 * One card per module, in navigation order: its name, its one line and its
 * screen; an open card adds the module page's own lead and the feature's
 * page in the app.
 */
function Modules() {
  const modules = PLATFORM_GROUPS.flatMap((group) => group.items).flatMap((item) => {
    const shown = moduleScreen(item.href);
    if (!shown) return [];
    const { View } = SCREEN_CATALOG[shown.screen];
    const lead = PLATFORM_PAGES.find((page) => page.path === item.href)?.lead ?? item.desc;
    return [{ ...item, page: shown.page, screen: <View />, lead }];
  });
  return (
    // The rail draws the header itself, so its buttons sit on the heading's row.
    <PageSection id="platform" label="Tools for AI visibility, search and your website">
      <CardRail
        label="modules"
        head={
          <SectionHeader
            title="Tools for AI visibility, search and your website"
            action={<SiteArrowLink href="/platform">See the whole platform</SiteArrowLink>}
          />
        }
        items={modules.map((module) => ({
          key: module.href,
          content: (
            <RailCard
              href={module.href}
              label={module.title}
              title={module.desc}
              body={module.lead}
              media={<ProductFrame label={module.title}>{module.screen}</ProductFrame>}
              page={
                <ProductFrame label={`The ${module.page.title} page in the CiteLadder app`}>
                  <ScreenAppPage {...module.page}>{module.screen}</ScreenAppPage>
                </ProductFrame>
              }
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

const AnswerScreen = SCREEN_CATALOG.answer.View;

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
            <AnswerScreen />
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
