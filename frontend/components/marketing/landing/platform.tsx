import { Activity, Check, FileCheck2, Globe2, LineChart, Sparkles } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';

export function Platform() {
  const { platform } = LANDING_CONTENT;

  return (
    <Section id="platform" tone="paper" rhythm="base" aria-labelledby="platform-title">
      <SectionHeader
        eyebrow={platform.kicker}
        title={platform.title}
        lead={platform.lead}
        align="center"
        headingId="platform-title"
      />

      {/* Visual System Architecture Diagram */}
      <div className="relative mx-auto w-full max-w-6xl">
        {/* Top Hub: Growth Agent Orchestrator Card */}
        <Reveal>
          <div className="bg-panel border-border shadow-card hover:border-accent-border/80 relative w-full overflow-hidden rounded-2xl border p-6 transition-all duration-300 md:p-7">
            {/* Ambient Glow */}
            <div
              aria-hidden
              className="bg-accent/10 pointer-events-none absolute -top-12 -right-12 size-64 rounded-full blur-3xl filter"
            />

            <div className="relative z-1 flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-accent-subtle text-accent-text border-accent-border/60 text-2xs inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 font-mono font-semibold tracking-wider uppercase">
                    <Sparkles className="size-3" /> Central Core
                  </span>
                  <span className="bg-success-bg/80 text-success-text border-success-border/60 text-2xs inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono font-medium">
                    <span className="bg-success-text size-1.5 animate-pulse rounded-full" />
                    Ingesting Pipelines
                  </span>
                </div>
                <h3 className="font-display text-foreground mt-2.5 text-xl font-bold md:text-2xl">
                  Growth Agent Orchestrator
                </h3>
                <p className="text-muted mt-1.5 max-w-xl text-sm leading-relaxed">
                  Ingests data streaming from Site, Content, and Demand intelligence to orchestrate
                  growth.
                </p>
              </div>

              {/* Control Telemetry Box */}
              <div className="border-border bg-background-alt/80 flex shrink-0 flex-col gap-1.5 rounded-xl border p-3.5 text-xs">
                <div className="flex items-center justify-between gap-5 font-mono">
                  <span className="text-muted">Ingestion:</span>
                  <span className="text-accent-text font-semibold">Continuous ↑</span>
                </div>
                <div className="flex items-center justify-between gap-5 font-mono">
                  <span className="text-muted">Provenance:</span>
                  <span className="text-foreground font-semibold">100% Verifiable</span>
                </div>
                <div className="flex items-center justify-between gap-5 font-mono">
                  <span className="text-muted">Human Gate:</span>
                  <span className="text-success-text font-semibold">Enforced</span>
                </div>
              </div>
            </div>

            {/* Bottom Stream Status */}
            <div className="border-border/60 bg-background/80 mt-5 flex items-center justify-between rounded-xl border px-4 py-2.5 font-mono text-xs">
              <div className="flex items-center gap-2">
                <Activity className="text-accent-text size-4 animate-pulse" />
                <span className="text-muted">Live Pipeline:</span>
                <span className="text-foreground font-medium">
                  Site + Content + Demand telemetry streaming UP into Agent Core
                </span>
              </div>
              <span className="text-accent-text hidden font-semibold sm:inline">
                Real-Time Loop
              </span>
            </div>
          </div>
        </Reveal>

        {/* Upward Flowing Stream Pipelines — Equal Dot Size, Speed, and Spatial Spacing */}
        <div aria-hidden className="relative z-10 my-4 hidden h-20 w-full md:block">
          <svg
            className="pipeline-stream size-full overflow-visible"
            viewBox="0 0 1000 80"
            fill="none"
          >
            <defs>
              <linearGradient id="pipe-stream-gradient" x1="0" y1="100%" x2="0" y2="0%">
                <stop offset="0%" stopColor="var(--color-border)" stopOpacity="0.4" />
                <stop offset="50%" stopColor="var(--color-accent)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="1" />
              </linearGradient>
            </defs>

            {/* Pipeline Conduit Paths (Bottom Nodes -> Top Core) */}
            <path
              id="path-site-pipe"
              d="M 180 80 L 180 40 L 500 40 L 500 0"
              stroke="url(#pipe-stream-gradient)"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
            <path
              id="path-content-pipe"
              d="M 500 80 L 500 0"
              stroke="url(#pipe-stream-gradient)"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
            <path
              id="path-demand-pipe"
              d="M 820 80 L 820 40 L 500 40 L 500 0"
              stroke="url(#pipe-stream-gradient)"
              strokeWidth="2"
              strokeDasharray="5 4"
            />

            {/* Stream 1: Site -> Core (Path Length = 400px, Speed = 80px/s => dur="5s", Gap = 40px) */}
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="0s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="0.5s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="1.0s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="1.5s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="2.0s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="2.5s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="3.0s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="3.5s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="4.0s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="4.5s">
                <mpath href="#path-site-pipe" />
              </animateMotion>
            </circle>

            {/* Stream 2: Content -> Core (Path Length = 80px, Speed = 80px/s => dur="1s", Gap = 40px) */}
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="1s" repeatCount="indefinite" begin="0s">
                <mpath href="#path-content-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="1s" repeatCount="indefinite" begin="0.5s">
                <mpath href="#path-content-pipe" />
              </animateMotion>
            </circle>

            {/* Stream 3: Demand -> Core (Path Length = 400px, Speed = 80px/s => dur="5s", Gap = 40px) */}
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="0s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="0.5s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="1.0s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="1.5s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="2.0s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="2.5s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="3.0s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="3.5s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="4.0s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>
            <circle r="3" fill="var(--color-accent)">
              <animateMotion dur="5s" repeatCount="indefinite" begin="4.5s">
                <mpath href="#path-demand-pipe" />
              </animateMotion>
            </circle>

            {/* Pipeline Stream Labels */}
            <text
              x="180"
              y="28"
              fill="var(--color-muted)"
              fontSize="10"
              fontWeight="600"
              fontFamily="monospace"
              textAnchor="middle"
            >
              Site Telemetry ↑
            </text>
            <text
              x="500"
              y="28"
              fill="var(--color-muted)"
              fontSize="10"
              fontWeight="600"
              fontFamily="monospace"
              textAnchor="middle"
            >
              Briefs & Schema ↑
            </text>
            <text
              x="820"
              y="28"
              fill="var(--color-muted)"
              fontSize="10"
              fontWeight="600"
              fontFamily="monospace"
              textAnchor="middle"
            >
              Demand Signals ↑
            </text>
          </svg>
        </div>

        {/* Three Connected Intelligence Layers */}
        <StaggerGroup className="grid gap-5 md:grid-cols-3">
          {/* Layer 01: Site Intelligence */}
          <StaggerItem className="h-full">
            <article className="bg-panel border-border shadow-card hover:shadow-card-hover group flex h-full flex-col justify-between rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="bg-accent-subtle/80 text-accent-text border-accent-border/60 flex size-10 items-center justify-center rounded-xl border shadow-xs">
                    <Globe2 className="size-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="bg-background-alt text-subtle border-border/60 text-2xs rounded-full border px-2.5 py-0.5 font-mono font-semibold tabular-nums">
                    01 · Site
                  </span>
                </div>

                <h3 className="font-display text-foreground group-hover:text-accent-text mt-4 text-base font-bold transition-colors">
                  Site Intelligence
                </h3>
                <p className="text-muted mt-1.5 text-xs leading-relaxed">
                  Crawls and classifies page roles, knowledge, and gap rules.
                </p>

                <ul className="mt-4 flex flex-col gap-2">
                  <li className="text-secondary flex items-start gap-2 text-xs font-medium">
                    <span className="bg-success-bg/80 text-success-text border-success-border/60 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-2.5 stroke-[2.5]" aria-hidden />
                    </span>
                    <span>Automated crawl & classification</span>
                  </li>
                  <li className="text-secondary flex items-start gap-2 text-xs font-medium">
                    <span className="bg-success-bg/80 text-success-text border-success-border/60 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-2.5 stroke-[2.5]" aria-hidden />
                    </span>
                    <span>Gap detection rules</span>
                  </li>
                  <li className="text-secondary flex items-start gap-2 text-xs font-medium">
                    <span className="bg-success-bg/80 text-success-text border-success-border/60 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-2.5 stroke-[2.5]" aria-hidden />
                    </span>
                    <span>Recrawl verification pass</span>
                  </li>
                </ul>
              </div>

              <div className="border-border/60 text-accent-text text-2xs mt-5 border-t pt-2.5 font-mono font-semibold">
                Feeds Stream UP → Core
              </div>
            </article>
          </StaggerItem>

          {/* Layer 02: Content Intelligence */}
          <StaggerItem className="h-full">
            <article className="bg-panel border-border shadow-card hover:shadow-card-hover group flex h-full flex-col justify-between rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="bg-accent-subtle/80 text-accent-text border-accent-border/60 flex size-10 items-center justify-center rounded-xl border shadow-xs">
                    <FileCheck2 className="size-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="bg-background-alt text-subtle border-border/60 text-2xs rounded-full border px-2.5 py-0.5 font-mono font-semibold tabular-nums">
                    02 · Content
                  </span>
                </div>

                <h3 className="font-display text-foreground group-hover:text-accent-text mt-4 text-base font-bold transition-colors">
                  Content Intelligence
                </h3>
                <p className="text-muted mt-1.5 text-xs leading-relaxed">
                  Converts gaps into evidence-backed briefs and schema.
                </p>

                <ul className="mt-4 flex flex-col gap-2">
                  <li className="text-secondary flex items-start gap-2 text-xs font-medium">
                    <span className="bg-success-bg/80 text-success-text border-success-border/60 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-2.5 stroke-[2.5]" aria-hidden />
                    </span>
                    <span>Evidence-grounded briefs</span>
                  </li>
                  <li className="text-secondary flex items-start gap-2 text-xs font-medium">
                    <span className="bg-success-bg/80 text-success-text border-success-border/60 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-2.5 stroke-[2.5]" aria-hidden />
                    </span>
                    <span>FAQPage JSON-LD schema</span>
                  </li>
                  <li className="text-secondary flex items-start gap-2 text-xs font-medium">
                    <span className="bg-success-bg/80 text-success-text border-success-border/60 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-2.5 stroke-[2.5]" aria-hidden />
                    </span>
                    <span>Human approval with provenance</span>
                  </li>
                </ul>
              </div>

              <div className="border-border/60 text-accent-text text-2xs mt-5 border-t pt-2.5 font-mono font-semibold">
                Feeds Stream UP → Core
              </div>
            </article>
          </StaggerItem>

          {/* Layer 03: Demand Intelligence */}
          <StaggerItem className="h-full">
            <article className="bg-panel border-border shadow-card hover:shadow-card-hover group flex h-full flex-col justify-between rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="bg-accent-subtle/80 text-accent-text border-accent-border/60 flex size-10 items-center justify-center rounded-xl border shadow-xs">
                    <LineChart className="size-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="bg-background-alt text-subtle border-border/60 text-2xs rounded-full border px-2.5 py-0.5 font-mono font-semibold tabular-nums">
                    03 · Demand
                  </span>
                </div>

                <h3 className="font-display text-foreground group-hover:text-accent-text mt-4 text-base font-bold transition-colors">
                  Demand Intelligence
                </h3>
                <p className="text-muted mt-1.5 text-xs leading-relaxed">
                  Unifies Search Console, GA4, and AI visibility signals.
                </p>

                <ul className="mt-4 flex flex-col gap-2">
                  <li className="text-secondary flex items-start gap-2 text-xs font-medium">
                    <span className="bg-success-bg/80 text-success-text border-success-border/60 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-2.5 stroke-[2.5]" aria-hidden />
                    </span>
                    <span>Search Console + GA4 sync</span>
                  </li>
                  <li className="text-secondary flex items-start gap-2.5 text-xs font-medium">
                    <span className="bg-success-bg/80 text-success-text border-success-border/60 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-2.5 stroke-[2.5]" aria-hidden />
                    </span>
                    <span>AI visibility across answer engines</span>
                  </li>
                  <li className="text-secondary flex items-start gap-2 text-xs font-medium">
                    <span className="bg-success-bg/80 text-success-text border-success-border/60 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-2.5 stroke-[2.5]" aria-hidden />
                    </span>
                    <span>Organic & AI signal unification</span>
                  </li>
                </ul>
              </div>

              <div className="border-border/60 text-accent-text text-2xs mt-5 border-t pt-2.5 font-mono font-semibold">
                Feeds Stream UP → Core
              </div>
            </article>
          </StaggerItem>
        </StaggerGroup>
      </div>
    </Section>
  );
}
