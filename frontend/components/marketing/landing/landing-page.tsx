import type { ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';

import { appHref } from '@/lib/config/app-link';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { platformLabel } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

import { EngineLogo, type OfficialEngineKey } from '../primitives/engine-logo';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { CapabilityGrid, FaqList } from '../pages/platform';
import {
  AgentBriefView,
  AgentView,
  AnswerView,
  AppShellFrame,
  CrawlerAccessView,
  ProductShot,
  SearchView,
  SiteHealthView,
  SourcesView,
  VisibilityTrendView,
  VisibilityView,
} from '../scenes/product-views';

import { FAQS } from './landing-data';
import { EngineRotor } from './landing-rotor';
import { Integrations, Teams, TextLink, Trust } from './landing-sections';

/* ── Shared bits ────────────────────────────────────────────────────────── */

function PrimaryActions({ size = 'marketing' }: Readonly<{ size?: 'lg' | 'marketing' }>) {
  const signup = selfServeSignupOpen();
  return (
    <div className="lp-actions">
      {signup ? (
        <ButtonLink href={appHref('/register')} size={size}>
          Start free trial
        </ButtonLink>
      ) : null}
      <DemoButtonLink variant={signup ? 'soft' : 'primary'} size={size} />
    </div>
  );
}

/* ── Hero ───────────────────────────────────────────────────────────────── */

/* The real AI Visibility page, still: its tabs and filter bar as shipped. */
function HeroShot() {
  return (
    <div className="lp-hero-shot">
      <div className="lp-hero-stage product-stage">
        <div className="lp-hero-frame product-fit">
          <AppShellFrame
            active="AI Visibility"
            title="AI Visibility"
            action="Launch audit"
            tabs={['Trends', 'Sources', 'Query fanouts']}
            activeTab="Trends"
            filters={[
              ['Latest run', 'Last 90 days', 'Per run'],
              ['Visibility prompts', 'All surfaces'],
            ]}
          >
            <VisibilityView />
          </AppShellFrame>
        </div>
      </div>
    </div>
  );
}

/* The hero opens on the copy and the product, then closes on the engines
   the answers come from: no separate strip between it and the first band. */
function Hero({ rotor }: Readonly<{ rotor?: ReactNode }>) {
  return (
    <header className="lp-hero">
      <div className="lp-wrap site-wrap lp-hero-copy mk-hero-in">
        <p className="lp-hero-pillars site-chip website-label">
          AI visibility · Search intelligence · Site health · Agent
        </p>
        <h1 className="website-hero-display lp-hero-title">
          See how AI and search find you, <span>then fix what holds you back</span>
        </h1>
        <p className="website-hero-lead lp-hero-lead">
          <span className="sr-only">
            CiteLadder tracks what ChatGPT, Gemini, Claude and Google AI Overviews say
          </span>
          <span aria-hidden>
            CiteLadder tracks what {rotor ?? <EngineRotor />} and Google AI Overviews say
          </span>{' '}
          about your brand, adds your keyword, backlink and Search Console data, audits your site,
          and turns it all into work your team can ship.
        </p>
        <PrimaryActions />
        {selfServeSignupOpen() ? (
          <p className="lp-hero-note">7-day free trial on ChatGPT answers. Trial limits apply.</p>
        ) : null}
      </div>
      <div className="lp-wrap site-wrap-cards">
        <HeroShot />
      </div>
      <EngineStrip />
    </header>
  );
}

const ENGINES: readonly [OfficialEngineKey, string][] = [
  ['openai', 'OpenAI API'],
  ['gemini', 'Gemini API'],
  ['claude', 'Claude API'],
  ['google', 'Google AI Overviews'],
];

function EngineStrip() {
  return (
    <section className="lp-engines" aria-label="Monitored answer engines">
      <div className="lp-wrap site-wrap lp-engines-inner">
        <p className="lp-engines-label">Answers collected from</p>
        <ul>
          {ENGINES.map(([engine, name]) => (
            <li key={engine}>
              <EngineLogo engine={engine} className="size-5" />
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── The loop ───────────────────────────────────────────────────────────── */

/** The statement that introduces "How it works", above its heading. */
function Statement() {
  return (
    <p className="lp-statement-text">
      Buyers ask AI before they ask you.{' '}
      <span>
        The answer names a few brands, cites a few pages and moves on. CiteLadder shows whether you
        are in it, why, and the next change most likely to put you there.
      </span>
    </p>
  );
}

function BentoTile({
  title,
  body,
  href,
  className,
  children,
}: Readonly<{
  title: string;
  body: string;
  href: string;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <a href={href} className={cn('lp-tile site-card', className)}>
      <div className="lp-tile-copy">
        <h3 className="website-feature-heading">{title}</h3>
        <p className="website-body">{body}</p>
      </div>
      <div className="lp-tile-visual product-fit app-type-scale" data-ui aria-hidden>
        {children}
      </div>
    </a>
  );
}

function Loop() {
  return (
    <section className="lp-section site-band" id="how-it-works">
      <span id="see-it" className="lp-anchor" aria-hidden />
      <div className="lp-wrap site-wrap lp-stack">
        <Statement />
        <div className="lp-head">
          <h2 className="website-section-heading">From an AI answer to the fix that moves it</h2>
          <p className="website-lead">
            Measure the questions your buyers ask, trace each result to its sources, and turn what
            you find into reviewable work. Then measure again.
          </p>
        </div>
        <div className="lp-bento site-cards">
          <BentoTile
            className="lp-tile-wide"
            title="Track your share of the answer"
            body="Brand mentions, position and competitors across the prompts your buyers actually ask."
            href="/platform/ai-visibility"
          >
            <VisibilityTrendView />
          </BentoTile>
          <BentoTile
            title="See which pages get cited"
            body="Every cited domain and URL, classified as owned, review, editorial, community or competitor."
            href="/platform/citation-intelligence"
          >
            <SourcesView />
          </BentoTile>
          <BentoTile
            title="Find what holds pages back"
            body="Technical and answer-readiness checks per page, including which AI crawlers you allow."
            href="/platform/site-health"
          >
            <CrawlerAccessView />
          </BentoTile>
          <BentoTile
            className="lp-tile-wide"
            title="Turn findings into work your team can ship"
            body="The Agent drafts briefs, page edits and plans from your saved evidence. Nothing publishes without you."
            href="/platform/agents"
          >
            <AgentBriefView />
          </BentoTile>
        </div>
      </div>
    </section>
  );
}

/* ── Platform, integrations, teams, trust ───────────────────────────────── */

function PlatformGrid() {
  return (
    <section className="lp-section site-band" id="platform">
      <div className="lp-wrap site-wrap lp-stack">
        <div className="lp-head lp-head-split">
          <h2 className="website-section-heading">Everything in one project</h2>
          <TextLink href="/platform">See the whole platform</TextLink>
        </div>
        <CapabilityGrid />
      </div>
    </section>
  );
}

/* ── Measure, diagnose, improve ─────────────────────────────────────────── */

type Pillar = {
  readonly stage: string;
  readonly title: string;
  readonly body: string;
  readonly points: readonly string[];
  /** Platform routes; each link takes its module's published name. */
  readonly modules: readonly string[];
  readonly shot: string;
  readonly view: ReactNode;
};

const PILLARS: readonly Pillar[] = [
  {
    stage: 'Measure',
    title: 'Know how often AI recommends you, and who it cites instead',
    body: 'Run the short, buyer-style questions people actually ask. Every score opens the recorded answer: the engine, the prompt, the date, your position and every source it cited.',
    points: [
      'Competitors side by side on the same prompts',
      'Mentions, citations and referral visits kept as separate signals',
      'Product and category answers for ecommerce teams',
    ],
    modules: [
      '/platform/ai-visibility',
      '/platform/citation-intelligence',
      '/platform/ai-referral-analytics',
      '/platform/commerce-intelligence',
    ],
    shot: 'Answer record',
    view: <AnswerView />,
  },
  {
    stage: 'Diagnose · Search Intelligence',
    title: 'Keyword and backlink research beside your AI evidence',
    body: 'See the keywords competitors rank for and you do not, the domains linking to them and not to you, and the pages that win. Each dataset shows its cost before you confirm.',
    points: [
      'Keyword gaps and competitor rankings',
      'Backlink and referring-domain overlap',
      'Competing domains and their top pages',
      'No surprise spend: review scope and cost first',
    ],
    modules: ['/platform/search-intelligence', '/platform/demand-intelligence'],
    shot: 'Search Intelligence',
    view: <SearchView />,
  },
  {
    stage: 'Diagnose · Site Health and Demand',
    title: 'Fix the site issues and search gaps that keep you out',
    body: 'Crawl your site for page-level findings, from indexing and structured data to which AI crawlers robots.txt lets in. Add Search Console to find queries one edit away from page one.',
    points: [
      'AI crawler permissions by purpose: search, training, user fetch',
      'Striking-distance queries and CTR gaps per landing page',
      'Coverage shown next to every score',
    ],
    modules: ['/platform/site-health', '/platform/demand-intelligence'],
    shot: 'Site Health',
    view: <SiteHealthView />,
  },
  {
    stage: 'Improve',
    title: 'Turn findings into work your team can ship, then measure again',
    body: 'The Agent and Content Intelligence draft briefs, page edits and outreach plans from your saved evidence. Use the same evidence from your own assistant over MCP. Nothing publishes without you.',
    points: [
      'Briefs and new pages for gaps you can see',
      'Edits to existing pages, with the reason attached',
      'Re-run the same prompts to verify the change',
    ],
    modules: ['/platform/content-intelligence', '/platform/agents', '/platform/mcp'],
    shot: 'Agent',
    view: <AgentView />,
  },
];

function PillarDive({ stage, title, body, points, modules, shot, view }: Pillar) {
  return (
    <div className="mk-dive">
      <div className="mk-dive-copy">
        <p className="website-label lp-pillar-stage">{stage}</p>
        <h3 className="website-page-title mk-dive-title">{title}</h3>
        <p className="website-body">{body}</p>
        <ul className="mk-checks">
          {points.map((point) => (
            <li key={point}>
              <Check aria-hidden className="size-4" />
              {point}
            </li>
          ))}
        </ul>
        <ul className="lp-pillar-modules">
          {modules.map((href) => (
            <li key={href}>
              <a className="lp-pillar-module website-label" href={href}>
                {platformLabel(href)}
                <ArrowRight aria-hidden className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <ProductShot title={shot}>{view}</ProductShot>
    </div>
  );
}

function Pillars() {
  return (
    <section className="lp-section site-band" id="pillars" aria-labelledby="pillars-title">
      <div className="lp-wrap site-wrap lp-stack">
        <div className="lp-head">
          <h2 id="pillars-title" className="website-section-heading">
            Measure, diagnose, improve
          </h2>
        </div>
        <div className="lp-dives site-rows">
          {PILLARS.map((pillar) => (
            <PillarDive key={pillar.title} {...pillar} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="lp-section site-band" id="landing-faq">
      <div className="lp-wrap site-wrap lp-faq site-split">
        <div className="lp-head">
          <h2 className="website-section-heading">Questions, answered</h2>
          <TextLink href="/faq">All questions</TextLink>
        </div>
        <FaqList faqs={FAQS} />
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="lp-section marketing-closing-band site-band" id="get-started">
      <div className="lp-wrap site-wrap lp-closing">
        <h2 className="website-section-heading">See what AI says about you today</h2>
        <p className="website-lead">
          Add your site and a few questions your buyers ask. Get your first baseline, then decide
          what to fix.
        </p>
        <PrimaryActions />
      </div>
    </section>
  );
}

/**
 * Server-rendered; `rotor` is the lead's hydrated engine rotor (see
 * `EngineRotor`). Without it the lead renders its static first engine.
 */
export function LandingPage({ rotor }: Readonly<{ rotor?: ReactNode }>) {
  return (
    <div className="lp">
      <Hero rotor={rotor} />
      <Loop />
      <PlatformGrid />
      <Pillars />
      <Integrations />
      <Teams />
      <Trust />
      <Faq />
      <Closing />
    </div>
  );
}
