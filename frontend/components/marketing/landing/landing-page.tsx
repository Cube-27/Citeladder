import { EngineMark } from '@/components/ui/engine-mark';
import { PUBLIC_TRIAL } from '@/lib/config/public-trial';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { NAV_DROPS, PLATFORM_GROUPS, platformLabel } from '@/lib/marketing-content/nav';
import { PLATFORM_PAGES } from '@/lib/marketing-content/platform-pages';

import { AnnouncementPill } from '../chrome/announcement-pill';
import { SiteActions } from '../primitives/button';
import { EngineStrip } from '../sections/cards';
import { FeatureCard, FeatureSplit } from '../sections/features';
import { CardRail, RailCard } from '../sections/rail-cards';
import { LandingHero } from '../sections/heroes';
import { PageSection, SectionHeader } from '../sections/page-section';
import { SiteArrowLink, columnsFor } from '../sections/site-parts';
import { CtaBand, FaqList, Steps } from '../sections/steps-faq-cta';
import { ProductFrame } from '../screens/product-frame';
import { ScreenAppPage } from '../screens/screen-app';
import { ScreenAppInsights } from '../screens/screen-app-insights';
import { SCREEN_CATALOG, moduleScreen } from '../screens/screen-catalog';

import { FAQS, INTEGRATIONS, type IntegrationMark } from './landing-data';
import './integrations.css';

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
      actions={<SiteActions />}
      note={
        selfServeSignupOpen()
          ? `${PUBLIC_TRIAL.days}-day free trial on ChatGPT answers. Trial limits apply.`
          : null
      }
      frame={
        // The real app, chrome and all, as the page's first product view.
        <ProductFrame label="The Insights page in the CiteLadder app" fit="scale" hero>
          <ScreenAppInsights />
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

/** The source's own logo: an engine mark the site already draws, a logo file, or an icon. */
function IntegrationLogo({ mark }: Readonly<{ mark: IntegrationMark }>) {
  switch (mark.kind) {
    case 'engine':
      return <EngineMark engine={mark.engine} className="size-9" />;
    case 'image':
      return (
        <img
          src={mark.src}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          decoding="async"
          className="size-9 object-contain"
        />
      );
    case 'icon': {
      const Icon = mark.icon;
      return <Icon className="text-ink size-9" aria-hidden />;
    }
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

/**
 * The integrations as a logo field: the title above, the logo tiles in an arch
 * round the lead and link (integrations.css places them).
 */
function Integrations() {
  return (
    <PageSection id="integrations" label="Connect the data you already have">
      <div className="cl-ifield">
        <div className="cl-ifield-head">
          <SectionHeader
            title="Connect the data you already have"
            lead="Start with AI answers. Add other sources when you need them."
            action={
              <SiteArrowLink href="/platform/integrations">Explore integrations</SiteArrowLink>
            }
          />
        </div>
        <ul className="cl-ifield-tiles">
          {INTEGRATIONS.map((integration) => (
            <li key={integration.title} className="cl-ifield-tile">
              <span className="cl-ifield-logo">
                <IntegrationLogo mark={integration.mark} />
              </span>
              <span className="cl-ifield-name">{integration.title}</span>
            </li>
          ))}
        </ul>
      </div>
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
      <ul className="cl-tiles cl-audience">
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
          actions={<SiteActions />}
        />
      </PageSection>
    </>
  );
}
