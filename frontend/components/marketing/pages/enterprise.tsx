import { ArrowRight, Check, Layers, Shield, Sigma, type LucideIcon } from 'lucide-react';

import { DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';
import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { TrustStrip } from '../primitives/trust-strip';

type Capability = {
  icon: LucideIcon;
  title: string;
  tagline: string;
  highlights: readonly string[];
};

const CAPABILITIES: readonly Capability[] = [
  {
    icon: Shield,
    title: 'Security & BYOK Privacy',
    tagline: 'Provider credentials stay secret; backend topology never reaches the client bundle.',
    highlights: [
      'Fernet-encrypted BYOK keys at rest',
      'UUID identifiers throughout every workspace',
      'Same-origin API proxying',
    ],
  },
  {
    icon: Sigma,
    title: 'Audit-Ready Evidence',
    tagline: 'Numbers your compliance and security teams can re-derive, not just read.',
    highlights: [
      'Deterministic scoring rules',
      'Immutable artifacts and run logs',
      'No fabricated fallback zeros',
    ],
  },
  {
    icon: Layers,
    title: 'Durable Scale & Reliability',
    tagline: 'Orchestration built to survive worker restarts and heavy job queues.',
    highlights: [
      'PostgreSQL FOR UPDATE SKIP LOCKED queues',
      'Leases, heartbeats & retries',
      'Runtime Zod + Pydantic contracts',
    ],
  },
];

const DATA_FLOW_STEPS = [
  { step: '01', title: 'Browser Client', detail: 'Authenticated HTTPS request' },
  { step: '02', title: 'Next.js Proxy', detail: 'Same-origin edge route' },
  { step: '03', title: 'FastAPI Backend', detail: 'Schema & bearer check' },
  { step: '04', title: 'PostgreSQL', detail: 'Durable queue & runs' },
  { step: '05', title: 'Workers', detail: 'Async task execution' },
  { step: '06', title: 'AI Providers', detail: 'Fernet-encrypted BYOK' },
] as const;

const CUSTOM_LIMITS = [
  {
    title: 'Monthly audit runs',
    badge: 'Custom Volume',
    unit: 'prompt × engine × repetition',
    desc: 'Sized to your volumes for high-concurrency evaluation across all your active brand topics.',
  },
  {
    title: 'Monitored URLs',
    badge: 'Full Brand Set',
    unit: 'total monitored URL set',
    desc: 'The complete set of brand, product, and competitor pages crawled on schedule.',
  },
  {
    title: 'Projects & seats',
    badge: 'Unlimited Teams',
    unit: 'per enterprise workspace',
    desc: 'Each project carries its own prompts, competitors, engines, and evidence trails.',
  },
  {
    title: 'Evidence retention',
    badge: 'Up to 7 Years',
    unit: 'months of compliance history',
    desc: 'Immutable artifacts, raw model responses, and every derived metric preserved.',
  },
  {
    title: 'Engine connections',
    badge: 'All Providers',
    unit: 'OpenAI, Gemini, Claude, Perplexity, DeepSeek',
    desc: 'Connect standard or fine-tuned model endpoints with custom BYOK key routing.',
  },
  {
    title: 'Support & SLA',
    badge: '1-Hour SLA',
    unit: 'guaranteed response window',
    desc: 'Direct Slack/Teams channel, dedicated account manager, and 99.9% uptime target.',
  },
] as const;

export function EnterpriseHero() {
  return (
    <PageHero
      centered
      eyebrow="Enterprise"
      title="AI visibility, with"
      accent="enterprise-grade evidence."
      lead="Platform security teams can verify: deterministic scoring over immutable, provenance-carrying evidence — deployed and operated in our cloud, with the evidence trail your review process needs."
    >
      <div className="mt-mkt-30 gap-mkt-14 flex flex-col justify-center sm:flex-row">
        <ButtonLink href={DEMO_HREF}>
          Book a demo
          <ArrowRight aria-hidden />
        </ButtonLink>
        <ButtonLink href="/pricing" variant="ghost">
          Compare plans
        </ButtonLink>
      </div>
      <TrustStrip className="mt-mkt-30 justify-center" />
    </PageHero>
  );
}

export function EnterpriseOps() {
  return (
    <Section id="capabilities" tone="paper" rhythm="base" aria-label="Enterprise capabilities">
      <SectionHeader
        eyebrow="Capabilities"
        title="Built for teams that audit their tools."
        lead="Every claim below maps directly to the running platform architecture — bring your security and compliance team."
        headingId="enterprise-caps-title"
      />

      {/* 3 Spacious Pillar Cards */}
      <StaggerGroup className="gap-mkt-30 grid md:grid-cols-3">
        {CAPABILITIES.map(({ icon: Icon, title, tagline, highlights }) => (
          <StaggerItem key={title} className="h-full">
            <div className="rounded-mkt-lg bg-mkt-paper border-mkt-black-10 hover:border-mkt-indigo/40 shadow-mkt-card p-mkt-30 flex h-full flex-col justify-between border transition-all duration-200">
              <div>
                <div className="gap-mkt-14 flex items-center">
                  <span className="border-mkt-primary bg-mkt-surface-sunk text-mkt-indigo rounded-mkt-sm grid size-10 shrink-0 place-items-center border">
                    <Icon aria-hidden strokeWidth={1.8} className="size-5" />
                  </span>
                  <h3 className="font-mkt-display text-mkt-hsm text-mkt-ink leading-snug">
                    {title}
                  </h3>
                </div>
                <p className="text-mkt-body text-mkt-ink-soft mt-mkt-20 leading-relaxed">
                  {tagline}
                </p>
              </div>

              <ul className="border-mkt-black-10 mt-mkt-30 space-y-mkt-14 pt-mkt-30 border-t">
                {highlights.map((item) => (
                  <li
                    key={item}
                    className="text-mkt-sm text-mkt-ink gap-mkt-14 flex items-center font-medium"
                  >
                    <Check
                      aria-hidden
                      strokeWidth={2.5}
                      className="text-mkt-success-text size-4 shrink-0"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>

      {/* Clean Horizontal Data Flow */}
      <section aria-label="Platform data flow" className="mt-mkt-50">
        <div className="mb-mkt-20 flex items-center justify-between">
          <p className="text-mkt-xs text-mkt-ink-soft font-mono uppercase">
            Platform Data Flow & Security Boundaries
          </p>
          <span className="text-mkt-xs text-mkt-indigo font-mono uppercase">
            docs/architecture.md
          </span>
        </div>
        <Reveal className="rounded-mkt-lg bg-mkt-paper border-mkt-black-10 shadow-mkt-card p-mkt-30 md:p-mkt-30 border">
          <div className="gap-mkt-20 grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {DATA_FLOW_STEPS.map((s) => (
              <div key={s.step} className="border-mkt-black-10 py-mkt-6 pl-mkt-20 border-l-2">
                <p className="text-mkt-xs text-mkt-indigo font-mono font-semibold">{s.step}</p>
                <p className="text-mkt-body text-mkt-ink mt-mkt-6 font-semibold">{s.title}</p>
                <p className="text-mkt-sm text-mkt-ink-soft mt-mkt-6 leading-snug">{s.detail}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>
    </Section>
  );
}

export function EnterpriseLimits() {
  return (
    <Section id="limits" tone="sunken" rhythm="base" aria-label="Custom limits">
      <SectionHeader
        eyebrow="Custom limits"
        title="Shaped around your requirements."
        lead="Every enterprise agreement starts from these dials — tell us your volumes and we size the plan."
        headingId="enterprise-limits-title"
      />

      {/* Spacious 2-Column Limits Grid */}
      <Reveal className="rounded-mkt-lg bg-mkt-paper border-mkt-black-10 shadow-mkt-card overflow-hidden border">
        <div className="border-mkt-black-10 bg-mkt-surface-sunk/30 gap-mkt-20 p-mkt-30 md:p-mkt-30 flex flex-col justify-between border-b md:flex-row md:items-center">
          <div>
            <h3 className="font-mkt-display text-mkt-h3 text-mkt-ink">
              Tailored Enterprise Sizing
            </h3>
            <p className="text-mkt-body text-mkt-ink-soft mt-mkt-6">
              We quote directly against your operational numbers — not arbitrary tier buckets.
            </p>
          </div>
          <span className="border-mkt-primary bg-mkt-surface-sunk text-mkt-indigo text-mkt-sm rounded-mkt-sm px-mkt-20 py-mkt-10 shrink-0 self-start border font-semibold md:self-auto">
            Custom Agreement
          </span>
        </div>

        <StaggerGroup className="bg-mkt-black-10 grid gap-px md:grid-cols-2">
          {CUSTOM_LIMITS.map((item) => (
            <StaggerItem
              key={item.title}
              className="bg-mkt-paper hover:bg-mkt-surface p-mkt-30 transition-colors"
            >
              <div className="gap-mkt-14 flex flex-wrap items-center justify-between">
                <h4 className="font-mkt-display text-mkt-hsm text-mkt-ink">{item.title}</h4>
                <span className="border-mkt-primary bg-mkt-surface-sunk text-mkt-indigo text-mkt-xs rounded-mkt-sm px-mkt-14 py-mkt-6 border font-mono uppercase">
                  {item.badge}
                </span>
              </div>
              <p className="text-mkt-xs text-mkt-indigo mt-mkt-10 font-mono uppercase">
                {item.unit}
              </p>
              <p className="text-mkt-body text-mkt-ink-soft mt-mkt-14 leading-relaxed">
                {item.desc}
              </p>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </Reveal>

      {/* Bottom Quote CTA Strip */}
      <div className="rounded-mkt-lg bg-mkt-paper shadow-mkt-card border-mkt-black-10 mt-mkt-30 gap-mkt-30 p-mkt-30 flex flex-col items-start justify-between border md:flex-row md:items-center">
        <div>
          <p className="font-mkt-display text-mkt-h4 text-mkt-ink">
            Verifiable Operations & Audit Trail
          </p>
          <p className="text-mkt-body text-mkt-ink-soft mt-mkt-6 max-w-[80ch] leading-relaxed">
            Deterministic scoring rules, immutable run logs, and provenance stamps on every derived
            metric.
          </p>
        </div>
        <ButtonLink href={DEMO_HREF} className="shrink-0">
          Request custom quote
          <ArrowRight aria-hidden />
        </ButtonLink>
      </div>
    </Section>
  );
}

export function EnterpriseContactCta() {
  return (
    <Section id="contact" tone="paper" rhythm="base" aria-label="Contact sales">
      <Reveal className="mx-auto max-w-5xl text-center">
        <h2 className="font-mkt-display text-mkt-h2 text-mkt-ink mb-mkt-20 mx-auto max-w-[32ch]">
          Bring AI visibility in-house.
        </h2>
        <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[80ch]">
          Tell us your volumes, constraints and review process — we’ll shape an enterprise plan
          around them, starting with a walkthrough of your own category.
        </p>
        <div className="mt-mkt-30 gap-mkt-14 flex flex-col items-center justify-center sm:flex-row">
          <ButtonLink href={DEMO_HREF} className="w-full sm:w-auto">
            Book a demo
            <ArrowRight aria-hidden />
          </ButtonLink>
          <ButtonLink href="/faq" variant="ghost" className="w-full sm:w-auto">
            Read the FAQ
          </ButtonLink>
        </div>
        <TrustStrip className="mt-mkt-30 justify-center" />
      </Reveal>
    </Section>
  );
}
