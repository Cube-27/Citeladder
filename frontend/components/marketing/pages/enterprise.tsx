import { SiteActions } from '../primitives/button';
import { Bento, FeatureCard, FeatureSplit } from '../sections/features';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { columnsFor } from '../sections/site-parts';
import { CtaBand } from '../sections/steps-faq-cta';
import { CatalogFrame } from '../screens/screen-catalog';

const EVIDENCE_POINTS = [
  'Raw answers stored before any metric',
  'Scoring rules open source under AGPL-3.0',
  'Unavailable, not configured and zero kept apart',
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

function EvidenceSplit() {
  return (
    <FeatureSplit
      as="h2"
      title="Every number traces to a stored answer"
      body="Each score opens its prompt, engine, answer and cited sources, scored by public rules."
      points={EVIDENCE_POINTS}
      links={[{ href: '/platform/ai-visibility', label: 'AI visibility' }]}
      media={<CatalogFrame screen="sources" />}
    />
  );
}

export function EnterprisePage() {
  return (
    <>
      <PageHero
        size="2xl"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Enterprise' }]}
        title="The AEO platform whose scoring you can audit"
        lead="Measure how AI describes your brand, with results your security and analytics teams can check."
        actions={<SiteActions />}
      >
        <CatalogFrame screen="answer" />
      </PageHero>

      <PageSection spacing="compact" label="Evidence">
        <EvidenceSplit />
      </PageSection>

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
          actions={<SiteActions />}
        />
      </PageSection>
    </>
  );
}
