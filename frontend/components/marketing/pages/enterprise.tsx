import { TextLink } from '@/components/ui/text-link';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { Bento, FeatureCard } from '../sections/features';
import { PageHero } from '../sections/heroes';
import { PageHighlight } from '../sections/page-highlight';
import { PageSection } from '../sections/page-section';
import { CheckList, columnsFor } from '../sections/site-parts';
import { CtaBand, Steps } from '../sections/steps-faq-cta';
import { CatalogFrame } from '../screens/screen-catalog';

/**
 * Enterprise (`/enterprise`). Every statement here describes how the product
 * is built today; there are no certifications, customers or commitments that
 * an agreement has not set.
 */

const EVIDENCE_POINTS = [
  'Raw answers are stored before any metric is calculated',
  'The scoring rules are deterministic, versioned and published in the open-source repository under AGPL-3.0',
  'Mentions match on word boundaries; citations come only from engine citation metadata',
  'Unavailable, not-configured and observed-zero results stay distinct from each other',
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
      'Each derived metric keeps the source answers and the processing version it came from',
      'No LLM-as-judge scoring; the method is readable in the public code',
    ],
  },
  {
    title: 'Execution',
    points: [
      'PostgreSQL holds durable state and the work queue',
      'Leases, heartbeats, retries and terminal states are recorded for every run',
      'Runtime Zod contracts validate the browser/API boundary',
    ],
  },
] as const;

const DATA_FLOW = [
  { title: 'Browser', meta: 'Authenticated HTTPS' },
  { title: 'Same-origin app', meta: 'Relative API requests' },
  { title: 'API boundary', meta: 'Schema and workspace authorization' },
  { title: 'PostgreSQL', meta: 'Evidence and durable queue' },
  { title: 'Workers', meta: 'Leased execution' },
  { title: 'Answer engines', meta: 'Your configured keys' },
] as const;

const FIT = [
  {
    title: 'A security review',
    body: 'Reviewers get a short map of credential handling, workspace authorization, evidence retention and the managed-cloud boundary, plus the public scoring code to read.',
  },
  {
    title: 'Several teams or brands',
    body: 'Projects, prompts, provider connections and audit history stay with the workspace that owns them; one workspace cannot read another.',
  },
  {
    title: 'A measurement program',
    body: 'A defined prompt portfolio, repeated runs, like-for-like comparisons and enough context to review every observation.',
  },
] as const;

const AGREEMENT = [
  {
    title: 'Monthly audit runs',
    unit: 'Prompt × engine × repetition',
    desc: 'Sized to the brand topics you evaluate at the same time. Each prompt can be run up to 10 times per engine.',
  },
  {
    title: 'Monitored URLs',
    unit: 'Total monitored URL set',
    desc: 'Brand, product and competitor pages in your Site Health scope.',
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

/** The evidence trail: the answer an auditor opens, beside the rules that score it. */
function EvidenceTile() {
  return (
    <PageHighlight
      title="Every number traces to a stored answer and a published rule"
      body={
        <>
          Security, analytics and growth teams read the same{' '}
          <TextLink asChild text="inherit">
            <a href="/platform/ai-visibility">AI visibility</a>
          </TextLink>{' '}
          evidence: the prompt, the engine, the answer and the sources it cited. The rules that turn
          that evidence into a score are not a black box; they are in the open-source repository, so
          a reviewer can check the method instead of taking a description of it.
        </>
      }
    >
      <CheckList items={EVIDENCE_POINTS} small />
    </PageHighlight>
  );
}

export function EnterprisePage() {
  return (
    <>
      <PageHero
        size="2xl"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Enterprise' }]}
        title="The AEO platform whose scoring you can audit"
        lead="Enterprise AEO measurement for how ChatGPT, Gemini, Claude and Google AI Overviews describe your brand. Every score traces to a stored answer, the scoring code is public, and evidence stays inside your workspace."
        actions={
          <>
            <DemoButtonLink size="marketing">Book a demo</DemoButtonLink>
            <ButtonLink href="/pricing" variant="soft" size="marketing">
              Compare plans
            </ButtonLink>
          </>
        }
      >
        <Bento
          cells={[
            { key: 'answer', span: 7, content: <CatalogFrame screen="answer" /> },
            { key: 'evidence', span: 5, content: <EvidenceTile /> },
          ]}
        />
      </PageHero>

      <PageSection
        id="security"
        title="Every boundary has one owner"
        lead="Credentials, evidence and execution are each handled in one place, so a security reviewer can check them one at a time and read the code behind each."
      >
        <Bento
          cells={GOVERNANCE.map((group) => ({
            key: group.title,
            span: 4,
            content: <FeatureCard size="lg" title={group.title} points={group.points} />,
          }))}
        />
      </PageSection>

      <PageSection
        title="How a request travels"
        lead="The hosted platform runs in a managed cloud behind one same-origin boundary. Every read is checked against the workspace, and provider keys are resolved only when a worker calls an engine."
      >
        <Steps items={DATA_FLOW} />
      </PageSection>

      <PageSection
        id="fit"
        title="Who Enterprise is for"
        lead="Enterprise fits when your AEO program needs more scope, more review and clearer boundaries than a self-serve plan provides."
      >
        <ul className={`cl-tiles cl-cols-${columnsFor(FIT.length)}`}>
          {FIT.map((item) => (
            <li key={item.title}>
              <FeatureCard title={item.title} body={item.body} />
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection
        id="limits"
        title="Scope the agreement around the work"
        lead="Six inputs set an Enterprise agreement. Each is quoted to fit your program, and none changes how a score is computed."
      >
        <ul className={`cl-tiles cl-cols-${columnsFor(AGREEMENT.length)}`}>
          {AGREEMENT.map((item) => (
            <li key={item.title}>
              <FeatureCard eyebrow={item.unit} title={item.title} body={item.desc} />
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection id="contact" label="Contact sales">
        <CtaBand
          title="Bring your volumes and your review questions"
          lead="Tell us your prompt volumes, engines and security requirements. We will walk your reviewers through the evidence trail and the code that scores it."
          actions={
            <>
              <DemoButtonLink size="marketing">Book a demo</DemoButtonLink>
              <ButtonLink href="/faq" variant="soft" size="marketing">
                Read the FAQ
              </ButtonLink>
            </>
          }
        />
      </PageSection>
    </>
  );
}
