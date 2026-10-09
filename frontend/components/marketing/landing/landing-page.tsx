'use client';

import { useState, type ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';

import { appHref } from '@/lib/config/app-link';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { cn, cycled } from '@/lib/utils';

import { EngineLogo, type OfficialEngineKey } from '../primitives/engine-logo';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { CapabilityGrid, FaqList } from '../pages/platform';
import {
  AgentView,
  AnswerView,
  AppShellFrame,
  DemandView,
  ProductShot,
  SiteHealthView,
  SourcesView,
  VisibilityView,
  type AppShellChrome,
  type ShellFilters,
} from '../scenes/product-views';

import { FAQS } from './landing-data';
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

/* ── Hero and product tour ──────────────────────────────────────────────── */

/* The real AI Visibility page's tabs and filter bar. */
const VISIBILITY_TABS = ['Trends', 'Sources', 'Query fanouts'] as const;
const VISIBILITY_FILTERS: ShellFilters = [
  ['Latest run', 'Last 90 days', 'Per run'],
  ['Visibility prompts', 'All surfaces'],
];

const TOUR = [
  {
    id: 'visibility',
    label: 'Visibility',
    shell: {
      active: 'AI Visibility',
      title: 'AI Visibility',
      action: 'Launch audit',
      tabs: VISIBILITY_TABS,
      activeTab: 'Trends',
      filters: VISIBILITY_FILTERS,
    },
    View: VisibilityView,
  },
  {
    id: 'citations',
    label: 'Citations',
    shell: {
      active: 'AI Visibility',
      title: 'AI Visibility',
      action: 'Launch audit',
      tabs: VISIBILITY_TABS,
      activeTab: 'Sources',
      filters: VISIBILITY_FILTERS,
    },
    View: SourcesView,
  },
  {
    id: 'health',
    label: 'Site Health',
    shell: {
      active: 'Website',
      title: 'Website',
      tabs: ['Overview', 'Pages', 'Architecture', 'AEO Readiness', 'Internal links', 'Changes'],
      activeTab: 'Overview',
    },
    View: SiteHealthView,
  },
  {
    id: 'agent',
    label: 'Agent',
    shell: {
      mode: 'agent',
      active: 'Technical fix brief for /platform',
      title: 'Agent',
    },
    View: AgentView,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  shell: AppShellChrome;
  View: () => ReactNode;
}[];

type TourId = (typeof TOUR)[number]['id'];

function HeroTour() {
  const [active, setActive] = useState<TourId>('visibility');
  const step = TOUR.find((item) => item.id === active) ?? TOUR[0];
  return (
    <div className="lp-tour">
      <div className="lp-tour-tabs" role="tablist" aria-label="Product tour">
        {TOUR.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tour-tab-${item.id}`}
            aria-selected={item.id === active}
            aria-controls="tour-panel"
            tabIndex={item.id === active ? 0 : -1}
            onClick={() => setActive(item.id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              const index = TOUR.findIndex((entry) => entry.id === active);
              const next = cycled(TOUR, index + (event.key === 'ArrowRight' ? 1 : TOUR.length - 1));
              setActive(next.id);
              document.getElementById(`tour-tab-${next.id}`)?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="lp-hero-stage product-stage">
        <div
          id="tour-panel"
          role="tabpanel"
          aria-labelledby={`tour-tab-${step.id}`}
          className="lp-hero-frame product-fit"
        >
          <AppShellFrame {...step.shell}>
            <step.View />
          </AppShellFrame>
        </div>
      </div>
      <p className="product-caption text-center">
        Illustrative example with synthetic data. Engine availability depends on your plan.
      </p>
    </div>
  );
}

function Hero() {
  return (
    <header className="lp-hero">
      <div className="lp-wrap lp-hero-copy mk-hero-in">
        <h1 className="website-hero-display">Know what AI tells your buyers about you.</h1>
        <p className="website-lead lp-hero-lead">
          CiteLadder tracks how ChatGPT, Gemini, Claude and Google AI Overviews answer the questions
          your buyers ask: which brands they recommend and which pages they cite. Then it shows what
          to fix to earn a place in the answer.
        </p>
        <PrimaryActions />
        {selfServeSignupOpen() && (
          <p className="lp-hero-note">7-day free trial on ChatGPT answers. Trial limits apply.</p>
        )}
      </div>
      <div className="lp-wrap lp-wrap-wide">
        <HeroTour />
      </div>
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
      <div className="lp-wrap lp-engines-inner">
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

/* ── Statement and the loop ─────────────────────────────────────────────── */

function Statement() {
  return (
    <section className="lp-section lp-statement">
      <div className="lp-wrap">
        <p className="lp-statement-text">
          Buyers ask AI before they ask you.{' '}
          <span>
            The answer names a few brands, cites a few pages and moves on. CiteLadder shows whether
            you are in it, why, and the next change most likely to put you there.
          </span>
        </p>
      </div>
    </section>
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
    <a href={href} className={cn('lp-tile', className)}>
      <div className="lp-tile-copy">
        <h3 className="website-feature-heading">{title}</h3>
        <p className="website-body">{body}</p>
      </div>
      <div className="lp-tile-visual product-fit app-type-scale" aria-hidden>
        {children}
      </div>
    </a>
  );
}

function Loop() {
  return (
    <section className="lp-section" id="how-it-works">
      <span id="see-it" className="lp-anchor" aria-hidden />
      <div className="lp-wrap lp-stack">
        <div className="lp-head">
          <h2 className="website-section-heading">From an AI answer to the fix that moves it.</h2>
          <p className="website-lead">
            Measure the questions your buyers ask, trace each result to its sources, and turn what
            you find into reviewable work. Then measure again.
          </p>
        </div>
        <div className="lp-bento">
          <BentoTile
            className="lp-tile-wide"
            title="Track your share of the answer"
            body="Brand mentions, position and competitors across the prompts your buyers actually ask."
            href="/platform/ai-visibility"
          >
            <VisibilityView />
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
            <SiteHealthView />
          </BentoTile>
          <BentoTile
            className="lp-tile-wide"
            title="Turn findings into work your team can ship"
            body="The Agent drafts briefs, page edits and plans from your saved evidence. Nothing publishes without you."
            href="/platform/agents"
          >
            <AgentView />
          </BentoTile>
        </div>
      </div>
    </section>
  );
}

/* ── Deep dives ─────────────────────────────────────────────────────────── */

function DeepDive({
  title,
  body,
  points,
  link,
  reverse = false,
  children,
}: Readonly<{
  title: string;
  body: string;
  points: readonly string[];
  link: { href: string; label: string };
  reverse?: boolean;
  children: ReactNode;
}>) {
  return (
    <div className={cn('mk-dive', reverse && 'mk-dive-reverse')}>
      <div className="mk-dive-copy">
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
        <TextLink href={link.href}>{link.label}</TextLink>
      </div>
      {children}
    </div>
  );
}

function DeepDives() {
  return (
    <section className="lp-section lp-soft" id="why">
      <div className="lp-wrap lp-dives">
        <DeepDive
          title="Every number opens the answer behind it."
          body="Click any metric and read the recorded answer: the engine, the prompt, the date, where your brand appeared and which sources it cited."
          points={[
            'Mentions, citations and referral visits stay separate signals',
            'Answers are kept as recorded, never rewritten',
            'Later audits compare like with like',
          ]}
          link={{ href: '/platform/citation-intelligence', label: 'Explore Citation Intelligence' }}
        >
          <ProductShot title="Answer record">
            <AnswerView />
          </ProductShot>
        </DeepDive>
        <DeepDive
          reverse
          title="Fix the site issues that keep you out of answers."
          body="Crawl your site and get page-level findings with the evidence attached, from indexing and structured data to which AI crawlers your robots.txt lets in."
          points={[
            'Technical and answer-readiness checks per page',
            'AI crawler permissions by purpose: search, training, user fetch',
            'Coverage shown next to every score',
          ]}
          link={{ href: '/platform/site-health', label: 'Explore Site Health' }}
        >
          <ProductShot title="Site Health">
            <SiteHealthView />
          </ProductShot>
        </DeepDive>
        <DeepDive
          title="Bring in the search data you already trust."
          body="Connect Search Console and GA4 to see the queries that reach your pages and the visits AI assistants send, then add keyword and backlink research when you need it."
          points={[
            'Striking-distance queries and CTR gaps from Search Console',
            'AI referral sessions and landing pages from GA4',
            'Optional DataForSEO research, priced before you confirm',
          ]}
          link={{ href: '/platform/demand-intelligence', label: 'Explore Demand Intelligence' }}
        >
          <ProductShot title="Search Demand">
            <DemandView />
          </ProductShot>
        </DeepDive>
      </div>
    </section>
  );
}

/* ── Platform, integrations, teams, trust ───────────────────────────────── */

function PlatformGrid() {
  return (
    <section className="lp-section" id="platform">
      <div className="lp-wrap lp-stack">
        <div className="lp-head lp-head-split">
          <h2 className="website-section-heading">Everything in one project.</h2>
          <TextLink href="/platform">See the whole platform</TextLink>
        </div>
        <CapabilityGrid />
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="lp-section" id="landing-faq">
      <div className="lp-wrap lp-faq">
        <div className="lp-head">
          <h2 className="website-section-heading">Questions, answered.</h2>
          <TextLink href="/faq">All questions</TextLink>
        </div>
        <FaqList faqs={FAQS} />
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="lp-section marketing-closing-band" id="get-started">
      <div className="lp-wrap lp-closing">
        <h2 className="website-section-heading">See what AI says about you today.</h2>
        <p className="website-lead">
          Add your site and a few questions your buyers ask. Get your first baseline, then decide
          what to fix.
        </p>
        <PrimaryActions />
      </div>
    </section>
  );
}

/** The homepage's one announcement: assistants connect from the MCP page. */
function Announcement() {
  return (
    <div className="lp-announcement" data-cta-placement="announcement">
      <a href="/platform/mcp" className="website-label" data-marketing-cta="">
        New: connect CiteLadder to Claude, ChatGPT and more
        <ArrowRight aria-hidden className="size-4" />
      </a>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="lp">
      <Announcement />
      <Hero />
      <EngineStrip />
      <Statement />
      <Loop />
      <DeepDives />
      <PlatformGrid />
      <Integrations />
      <Teams />
      <Trust />
      <Faq />
      <Closing />
    </div>
  );
}
