import { ArrowRight, Check } from 'lucide-react';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';
import { AnswerView, ProductShot } from '../scenes/product-views';

/**
 * Enterprise (`/enterprise`). Every statement here describes how the product
 * is built today; there are no certifications, customers or commitments that
 * an agreement has not set.
 */

const EVIDENCE_POINTS = [
  'Raw answers are stored before any metric is calculated',
  'Deterministic rules and versioned analysis show how each result was produced',
  'Coverage gaps, unavailable and observed-zero results stay distinct',
] as const;

const GOVERNANCE = [
  {
    title: 'Credentials',
    points: [
      'Bring your own provider API keys',
      'Keys are encrypted at rest and resolved only at execution time',
      'Keys are never returned in API responses or logged in clear text',
    ],
  },
  {
    title: 'Evidence',
    points: [
      'Projects, prompts, connections and history are scoped to the owning workspace',
      'Each derived metric keeps the source answers it came from',
      'No LLM-as-judge scoring',
    ],
  },
  {
    title: 'Execution',
    points: [
      'PostgreSQL holds durable state and the work queue',
      'Leases, heartbeats, retries and terminal states are recorded for every run',
      'Runtime Zod and Pydantic contracts validate the browser/API boundary',
    ],
  },
] as const;

const DATA_FLOW = [
  { title: 'Browser', detail: 'Authenticated HTTPS' },
  { title: 'Same-origin app', detail: 'Relative API requests' },
  { title: 'API boundary', detail: 'Schema and workspace authorization' },
  { title: 'PostgreSQL', detail: 'Evidence and durable queue' },
  { title: 'Workers', detail: 'Leased execution' },
  { title: 'Answer engines', detail: 'Your configured keys' },
] as const;

const FIT = [
  {
    title: 'Security-led evaluation',
    body: 'Reviewers get a short map of credential handling, workspace authorization, evidence retention and the managed-cloud boundary.',
  },
  {
    title: 'Several teams or brands',
    body: 'Projects, prompts, provider connections and audit history stay with the workspace that owns them.',
  },
  {
    title: 'A measurement program',
    body: 'A defined prompt portfolio, comparable audits and enough context to review every observation.',
  },
] as const;

const AGREEMENT = [
  {
    title: 'Monthly audit runs',
    unit: 'Prompt × engine × repetition',
    desc: 'Sized to the brand topics you evaluate at the same time.',
  },
  {
    title: 'Monitored URLs',
    unit: 'Total monitored URL set',
    desc: 'Brand, product and competitor pages in your site-health scope.',
  },
  {
    title: 'Projects and seats',
    unit: 'Per enterprise workspace',
    desc: 'Each project keeps its own prompts, competitors, engines and audit history.',
  },
  {
    title: 'Evidence retention',
    unit: 'Set by agreement',
    desc: 'Retention terms for raw responses, artifacts and derived metrics.',
  },
  {
    title: 'Engine connections',
    unit: 'OpenAI, Google, Anthropic',
    desc: "Direct provider connections, each using your workspace's own API keys.",
  },
  {
    title: 'Support and SLA',
    unit: 'Set by agreement',
    desc: 'Response commitments and support channels defined in the contract.',
  },
] as const;

export function EnterpriseHero() {
  return (
    <PageHero
      centered
      title="AI visibility your security team can inspect."
      lead="Measure how ChatGPT, Gemini and Claude describe your brand, with an evidence trail scoped to your workspace. Ready for procurement and security review."
    >
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <DemoButtonLink size="marketing">
          Book a demo
          <ArrowRight aria-hidden />
        </DemoButtonLink>
        <ButtonLink href="/pricing" variant="soft" size="marketing">
          Compare plans
        </ButtonLink>
      </div>
    </PageHero>
  );
}

export function EnterpriseEvidence() {
  return (
    <Section rhythm="tight" className="pt-0" aria-label="Evidence trail">
      <div className="mk-dive">
        <div className="mk-dive-copy">
          <h2 className="website-page-title mk-dive-title">
            Every number traces to a stored answer.
          </h2>
          <p className="website-body">
            Security, analytics and growth teams read the same evidence: the prompt, the engine, the
            answer and the sources it cited.
          </p>
          <ul className="mk-checks">
            {EVIDENCE_POINTS.map((point) => (
              <li key={point}>
                <Check aria-hidden className="size-4" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <ProductShot title="Answer evidence">
          <AnswerView />
        </ProductShot>
      </div>
    </Section>
  );
}

export function EnterpriseGovernance() {
  return (
    <Section id="security" tone="soft" aria-label="Security and governance">
      <div className="mk-split">
        <SectionHeader
          title="Every boundary has one owner."
          lead="Credentials, evidence and execution are each handled in one place, so a reviewer can check them one at a time."
          headingId="enterprise-governance-title"
        />
        <div className="cm-groups">
          {GOVERNANCE.map((group) => (
            <div key={group.title} className="cm-group">
              <h3 className="website-feature-heading text-foreground">{group.title}</h3>
              <ul className="cm-list">
                {group.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function EnterpriseDataFlow() {
  return (
    <Section aria-label="How a request travels">
      <SectionHeader
        title="How a request travels."
        lead="CiteLadder runs in a managed cloud behind one same-origin boundary. Provider keys are resolved only when a worker calls an engine."
        headingId="enterprise-flow-title"
      />
      <ol className="cm-flow">
        {DATA_FLOW.map((step, index) => (
          <li key={step.title}>
            <span className="cm-flow-step">{index + 1}</span>
            <h3 className="website-feature-heading text-foreground">{step.title}</h3>
            <p className="website-label text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function EnterpriseFit() {
  return (
    <Section id="fit" tone="soft" aria-label="Who Enterprise is for">
      <SectionHeader
        title="Who Enterprise is for."
        lead="Enterprise fits when your program needs more scope and review than a self-serve plan provides."
        headingId="enterprise-fit-title"
      />
      <ul className="mk-highlights">
        {FIT.map((item) => (
          <li key={item.title}>
            <h3 className="website-feature-heading">{item.title}</h3>
            <p className="website-body">{item.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function EnterpriseLimits() {
  return (
    <Section id="limits" aria-label="Custom limits">
      <div className="mk-split">
        <SectionHeader
          title="Scope the agreement around the work."
          lead="Six inputs set an Enterprise agreement. Each is quoted to fit your program."
          headingId="enterprise-limits-title"
        />
        <dl className="cm-spec">
          {AGREEMENT.map((item) => (
            <div key={item.title}>
              <dt>
                <span className="cm-spec-title">{item.title}</span>
                <span className="cm-spec-unit">{item.unit}</span>
              </dt>
              <dd className="website-body">{item.desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}

export function EnterpriseContactCta() {
  return (
    <Section id="contact" className="marketing-closing-band" aria-label="Contact sales">
      <div className="flex flex-col items-center gap-8 text-center" data-cta-placement="closing">
        <SectionHeader
          title="Bring your volumes and your review process."
          lead="Tell us about your constraints and provider setup. We will focus the demo on the evidence your team needs."
          align="center"
        />
        <div className="flex flex-wrap justify-center gap-3">
          <DemoButtonLink size="marketing">Book a demo</DemoButtonLink>
          <ButtonLink href="/faq" variant="soft" size="marketing">
            Read the FAQ
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
