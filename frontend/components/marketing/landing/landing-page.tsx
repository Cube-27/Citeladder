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
          See whether AI recommends you, <span>and what to fix when it does not</span>
        </h1>
        <p className="website-hero-lead lp-hero-lead">
          <span className="sr-only">
            CiteLadder is the tool you use when you want ChatGPT, Gemini, Claude and Google AI
            Overviews to recommend your business
          </span>
          <span aria-hidden>
            CiteLadder is the tool you use when you want {rotor ?? <EngineRotor />} and Google AI
            Overviews to recommend your business
          </span>
          . It shows who each answer names and cites, and what to fix on your site.
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
      Buyers ask AI which business to pick.{' '}
      <span>CiteLadder shows whether the answer names you and which pages it cites.</span>
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
          <h2 className="website-section-heading">Measure the answer, then fix the page</h2>
          <p className="website-lead">
            Run your buyers&apos; questions, fix what the answers show, then run them again.
          </p>
        </div>
        <div className="lp-bento site-cards">
          <BentoTile
            className="lp-tile-wide"
            title="Track how often you are named"
            body="Mention rate, position and competitors for each prompt."
            href="/platform/ai-visibility"
          >
            <VisibilityTrendView />
          </BentoTile>
          <BentoTile
            title="See which pages get cited"
            body="Every cited URL, labelled owned, review, editorial, community or competitor."
            href="/platform/cited-sources"
          >
            <SourcesView />
          </BentoTile>
          <BentoTile
            title="Check each page for problems"
            body="Technical and answer-readiness checks, plus which AI crawlers you allow."
            href="/platform/site-health"
          >
            <CrawlerAccessView />
          </BentoTile>
          <BentoTile
            className="lp-tile-wide"
            title="Get drafts your team can review"
            body="The Agent drafts briefs and page edits from your evidence. You publish them."
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
    view: <AnswerView />,
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
    view: <SearchView />,
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
    shot: 'Site Health',
    view: <SiteHealthView />,
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
          Add your site and your buyers&apos; questions to get a first baseline.
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
