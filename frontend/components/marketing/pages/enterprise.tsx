import {
  ArrowRight,
  Check,
  Cloud,
  Layers,
  Server,
  Shield,
  Sigma,
  type LucideIcon,
} from 'lucide-react';
import { Fragment } from 'react';

import { DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink } from '../primitives/button';
import { Meta } from '../primitives/label';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';
import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { TrustStrip } from '../primitives/trust-strip';

/**
 * `/enterprise` explains the offer; every sales action uses the stable `/demo`
 * funnel through the centralized `DEMO_HREF`.
 */
type Capability = { icon: LucideIcon; title: string; blurb: string; points: readonly string[] };

/**
 * Every claim here maps to something in the running platform (README's
 * "Built for trustworthy operations", docs/architecture.md). No certification
 * or compliance claims — nothing the repository cannot ground.
 */
const OPS_CARDS: readonly Capability[] = [
  {
    icon: Shield,
    title: 'Security & privacy',
    blurb: 'Provider credentials stay secret, and backend topology stays server-side.',
    points: [
      'Strict workspace isolation — UUID identifiers throughout',
      'BYOK keys Fernet-encrypted at rest, write-only after save',
      'Same-origin API proxying — backend topology never reaches the client bundle',
    ],
  },
  {
    icon: Sigma,
    title: 'Audit-ready evidence',
    blurb: 'Numbers your compliance team can re-derive, not just read.',
    points: [
      'Deterministic scoring — analyzer + rule versions on every projection',
      'Immutable artifacts + provenance-carrying analyses, written once',
      'Unsupported metrics render as —, never fabricated zeros',
    ],
  },
  {
    icon: Layers,
    title: 'Scale & reliability',
    blurb: 'Orchestration that survives worker restarts and Monday-morning queues.',
    points: [
      'PostgreSQL durable queues — FOR UPDATE SKIP LOCKED, no Redis dependency',
      'Leases, heartbeats, retries and idempotency on every task',
      'Custom audit + crawl volumes tailored to your team',
    ],
  },
  {
    icon: Server,
    title: 'Self-host & control',
    blurb: 'The whole platform, inside your network.',
    points: [
      'Versioned scoring rules — every projection traces to persisted evidence',
      'Docker Compose topology — frontend, API, workers, PostgreSQL',
      'Typed contracts validated at runtime — Zod + Pydantic',
    ],
  },
];

const DEPLOY_CARDS: readonly Capability[] = [
  {
    icon: Cloud,
    title: 'Managed cloud',
    blurb: 'Managed by CUBE27 — you bring the keys.',
    points: [
      'Managed workers, queues and upgrades',
      'Workspace isolation with UUID scoping throughout',
      'Custom volumes, seats and retention',
      'Support options tailored to your review process',
    ],
  },
  {
    icon: Server,
    title: 'Self-hosted',
    blurb: 'The same platform, inside your network.',
    points: [
      'Docker Compose quickstart — web, workers, PostgreSQL',
      'Your ENCRYPTION_KEY wraps every BYOK secret',
      'Crawler + provider traffic stays inside your egress rules',
      'Typed /api/v1 contracts for internal integrations',
    ],
  },
];

/** Platform data flow (grounded in docs/architecture.md). */
const ARCH_FLOW = [
  { node: 'Browser', arrow: '→' },
  { node: 'Next.js same-origin proxy', arrow: '→' },
  { node: 'FastAPI', arrow: '→' },
  { node: 'PostgreSQL', arrow: '⇄' },
  { node: 'Workers', arrow: '→' },
] as const;

/** The dials an enterprise agreement is sized on. Values are per-agreement. */
const LIMIT_CELLS = [
  { label: 'Monthly audit runs', desc: 'prompt × engine × repetition, aggregated across projects' },
  { label: 'Monitored URLs', desc: 'total monitored set across all projects' },
  { label: 'Projects', desc: 'per workspace, each with its own prompts + competitors' },
  { label: 'Seats', desc: 'workspace members with access to audits + evidence' },
  { label: 'Evidence retention', desc: 'immutable artifacts, runs and derived projections' },
  { label: 'Support & SLA', desc: 'response targets, channels and escalation path' },
] as const;

function CheckList({ points }: Readonly<{ points: readonly string[] }>) {
  return (
    <ul className="mt-5 grid gap-2.5">
      {points.map((point) => (
        <li key={point} className="text-mkt-sm text-mkt-ink-soft flex gap-3">
          <Check
            aria-hidden
            strokeWidth={2.5}
            className="text-mkt-evidence-text mt-0.5 size-3.5 shrink-0"
          />
          {point}
        </li>
      ))}
    </ul>
  );
}

function CapabilityCard({ icon: Icon, title, blurb, points }: Capability) {
  return (
    <div className="border-mkt-line rounded-mkt-lg bg-mkt-surface h-full border p-7">
      <span className="border-mkt-proof-line bg-mkt-proof-wash text-mkt-proof-text rounded-mkt-xs grid size-9 place-items-center border">
        <Icon aria-hidden strokeWidth={1.8} className="size-4.5" />
      </span>
      <h3 className="font-mkt-display text-mkt-ink mt-5 text-[1.0625rem] font-semibold tracking-[-0.03em]">
        {title}
      </h3>
      <p className="text-mkt-sm text-mkt-ink-soft mt-2">{blurb}</p>
      <CheckList points={points} />
    </div>
  );
}

export function EnterpriseHero() {
  return (
    <PageHero
      centered
      eyebrow="Enterprise"
      title="AI visibility, with"
      accent="enterprise-grade evidence."
      lead="The platform security teams can verify: deterministic scoring over immutable, provenance-carrying evidence — deployed in our cloud, or self-hosted inside your network."
    >
      <div className="mt-9 flex flex-col justify-center gap-2.5 sm:flex-row">
        <ButtonLink href={DEMO_HREF}>
          Book a demo
          <ArrowRight className="size-3.5" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/pricing" intent="secondary">
          Compare plans
        </ButtonLink>
      </div>
      <TrustStrip className="mt-8 justify-center" />
    </PageHero>
  );
}

export function EnterpriseOps() {
  return (
    <Section id="capabilities" divided rhythm="loose" aria-label="Enterprise capabilities">
      <SectionHeader
        kicker="Capabilities"
        title="Built for teams that audit their tools."
        intro="Every claim below maps to the running platform — bring your security review."
        headingId="enterprise-caps-title"
      />
      <StaggerGroup className="grid gap-4 md:grid-cols-2">
        {OPS_CARDS.map((card) => (
          <StaggerItem key={card.title} className="h-full">
            <CapabilityCard {...card} />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </Section>
  );
}

export function EnterpriseSelfHost() {
  return (
    <Section id="deployment" divided rhythm="loose" aria-label="Deployment options">
      <SectionHeader
        kicker="Deployment"
        title="Our cloud, or your infrastructure."
        intro="Same codebase, same deterministic pipeline — pick where it runs."
        headingId="enterprise-deploy-title"
      />
      <StaggerGroup className="grid gap-4 md:grid-cols-2">
        {DEPLOY_CARDS.map((card) => (
          <StaggerItem key={card.title} className="h-full">
            <CapabilityCard {...card} />
          </StaggerItem>
        ))}
      </StaggerGroup>

      <Reveal
        aria-label="Platform data flow"
        className="border-mkt-line bg-mkt-paper-raised rounded-mkt-lg mt-4 flex flex-wrap items-center gap-x-3 gap-y-2.5 border p-6"
      >
        {ARCH_FLOW.map((step) => (
          <Fragment key={step.node}>
            <span className="border-mkt-line bg-mkt-surface text-mkt-ink-soft rounded-mkt-xs text-mkt-sm border px-2.5 py-1.5">
              {step.node}
            </span>
            <span aria-hidden className="text-mkt-line-strong">
              {step.arrow}
            </span>
          </Fragment>
        ))}
        <span className="border-mkt-proof-line bg-mkt-proof-wash text-mkt-proof-text rounded-mkt-xs text-mkt-sm border px-2.5 py-1.5">
          AI providers · BYOK
        </span>
      </Reveal>
    </Section>
  );
}

export function EnterpriseLimits() {
  return (
    <Section id="limits" divided rhythm="loose" aria-label="Custom limits">
      <SectionHeader
        kicker="Custom limits"
        title="Shaped around your requirements."
        intro="Every enterprise agreement starts from these dials — tell us the volumes and we size the plan."
        headingId="enterprise-limits-title"
      />
      <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LIMIT_CELLS.map((cell) => (
          <StaggerItem
            key={cell.label}
            className="border-mkt-line rounded-mkt-lg bg-mkt-surface h-full border p-6"
          >
            <Meta as="p">{cell.label}</Meta>
            <p className="font-mkt-display text-mkt-ink mt-4 text-[1.5rem] font-medium tracking-[-0.03em]">
              Custom
            </p>
            <p className="text-mkt-sm text-mkt-ink-muted mt-2">{cell.desc}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>
      <p className="text-mkt-sm text-mkt-ink-soft mt-8 max-w-[78ch]">
        Searchify does not claim SOC 2 or ISO certifications today.{' '}
        <b className="text-mkt-ink font-semibold">What it offers is verifiable:</b> a self-hostable
        platform, deterministic scoring, and evidence your team can audit line by line.
      </p>
    </Section>
  );
}

/**
 * Enterprise closing band. Its sales action routes through the stable `/demo`
 * funnel so booking/contact configuration remains centralized there.
 */
export function EnterpriseContactCta() {
  return (
    <Section id="contact" divided rhythm="loose" aria-label="Contact sales">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="font-mkt-display text-mkt-d2 text-mkt-ink mkt-display-w mx-auto mb-5 max-w-[16ch]">
          Bring AI visibility in-house.
        </h2>
        <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[54ch]">
          Tell us your volumes, constraints and review process — we’ll shape an enterprise plan
          around them, starting with a walkthrough of your own category.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
          <ButtonLink href={DEMO_HREF} className="w-full sm:w-auto">
            Book a demo
            <ArrowRight className="size-3.5" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/faq" intent="secondary" className="w-full sm:w-auto">
            Read the FAQ
          </ButtonLink>
        </div>
        <TrustStrip className="mt-8 justify-center" />
      </Reveal>
    </Section>
  );
}
