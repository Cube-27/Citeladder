/** Reviewed vendor positioning and evaluation copy; source dates are not release dates. */
type ComparisonSource = {
  label: string;
  url: string;
  reviewedDate: string;
};

export type Competitor = {
  slug: string;
  name: string;
  tagline: string;
  lead: string;
  context: string;
  metaTitle: string;
  metaDescription: string;
  sources: readonly ComparisonSource[];
  whenBody: string;
  conclusionHeading: string;
  conclusion: string;
};

/** Date the official sources below were last re-read. */
const SOURCES_REVIEWED = '2026-10-02';

export const COMPARISON_DISCLOSURE =
  'This comparison is written by CiteLadder. It summarizes public product information and provides evaluation questions. It is not an independent review or a promise that every feature is included in every plan.';

export const COMPARISON_CHECKLIST = [
  {
    heading: 'Collection',
    body: 'Which engines or answer sources are available for this plan, and how are observations collected?',
  },
  {
    heading: 'Evidence',
    body: 'Can we inspect the prompt, answer, citation and observation date behind a reported result?',
  },
  {
    heading: 'Definitions',
    body: 'How are mentions, citations, position and share of voice calculated? What happens when collection fails?',
  },
  {
    heading: 'Scope',
    body: 'Does the workflow cover monitoring, website diagnostics, content work, agent delivery or some combination?',
  },
  {
    heading: 'Reporting',
    body: 'Which exports and integrations are available for the selected plan?',
  },
  {
    heading: 'Cost',
    body: 'What is included in the subscription, and what additional usage or provider charges apply?',
  },
] as const;

export const COMPETITORS: readonly Competitor[] = [
  {
    slug: 'profound',
    name: 'Profound',
    tagline:
      'Explore a comparison with Profound’s broader AI marketing platform, including its monitoring and agent workflows.',
    lead: 'Profound presents a broad AI marketing platform with answer-engine insights, prompt intelligence, agent analytics and marketing agents. CiteLadder’s workflow brings AI visibility, citation analysis and website findings together.',
    context:
      'The useful comparison is the work your team needs to complete: monitoring a defined set of questions, investigating the supporting sources, or running a broader set of marketing workflows.',
    metaTitle: 'CiteLadder vs Profound for AI Visibility | CiteLadder',
    metaDescription:
      'Compare CiteLadder and Profound by product focus, evidence access and workflow needs. Use a practical checklist and current official product sources.',
    sources: [
      {
        label: 'Profound’s official product overview',
        url: 'https://www.tryprofound.com/',
        reviewedDate: SOURCES_REVIEWED,
      },
    ],
    whenBody:
      'Include Profound in your evaluation if a broad AI marketing platform and agent-based marketing workflows are central to your requirements. Ask which capabilities are included in the plan you are considering and how the underlying observations can be inspected.',
    conclusionHeading: 'A practical way to compare',
    conclusion:
      'Bring the same small prompt portfolio and one investigation to both demos. For example, ask how a team would examine a competitor mention, find the source behind it and document a next action. Compare the evidence, workflow effort and relevant commercial terms.',
  },
  {
    slug: 'otterly-ai',
    name: 'Otterly AI',
    tagline:
      'Compare monitoring, citation investigation and the evaluation questions that matter for your prompt portfolio.',
    lead: 'Otterly AI presents an AI search monitoring and optimization workflow covering brand visibility, cited sources and website-related recommendations. CiteLadder connects tracked answer observations with source analysis and Site Health.',
    context:
      'Compare how each workflow supports the questions your team tracks and the investigation it needs to perform after a change appears.',
    metaTitle: 'CiteLadder vs Otterly AI for AI Search Monitoring | CiteLadder',
    metaDescription:
      'Compare CiteLadder and Otterly AI for monitoring and citation investigation. Review evaluation questions, evidence access and official product information.',
    sources: [
      {
        label: 'Otterly AI’s official product overview',
        url: 'https://otterly.ai/',
        reviewedDate: SOURCES_REVIEWED,
      },
    ],
    whenBody:
      'Include Otterly AI in your evaluation when recurring AI search monitoring and related optimization work are the starting point. Confirm the exact engine selection, observation cadence, reporting and usage limits for the proposed plan.',
    conclusionHeading: 'Test the investigation as well as the dashboard',
    conclusion:
      'Choose a prompt where your brand and a competitor appear differently. Ask to inspect the answer, citation details and the route from that observation to a specific task. Compare how much context survives when the finding is exported or shared.',
  },
  {
    slug: 'scrunch-ai',
    name: 'Scrunch',
    tagline:
      'Consider AI visibility measurement alongside Scrunch’s monitoring, diagnostics and agent-delivery capabilities.',
    lead: 'Scrunch describes a platform spanning AI visibility monitoring, content diagnostics, bot observability and its Agent Experience Platform for agent delivery. CiteLadder combines answer observations, cited-source analysis and website findings.',
    context:
      'Treat monitoring, diagnostics and changes to content delivery as distinct requirements when evaluating the two products.',
    metaTitle: 'CiteLadder vs Scrunch for AI Search Visibility | CiteLadder',
    metaDescription:
      'Compare CiteLadder and Scrunch across visibility investigation, site diagnostics and workflow needs. Review the questions to ask and official product sources.',
    sources: [
      {
        label: 'Scrunch’s official platform overview',
        url: 'https://scrunch.com/',
        reviewedDate: SOURCES_REVIEWED,
      },
    ],
    whenBody:
      'Include Scrunch in your evaluation if agent traffic observability or agent-specific content delivery is an important part of the project. Ask what implementation is required, how content consistency is maintained and which capabilities are included in the selected plan.',
    conclusionHeading: 'Separate the observation from the intervention',
    conclusion:
      'Ask each vendor to show how it identifies a visibility issue and what it proposes changing. If the proposal affects delivery infrastructure, review rollout, verification and rollback requirements separately from reporting requirements.',
  },
  {
    slug: 'peec-ai',
    name: 'Peec AI',
    tagline:
      'Compare an AI search analytics workflow with CiteLadder’s visibility, source-analysis and website context.',
    lead: 'Peec AI presents AI search analytics for marketing teams, with visibility reporting and reporting/export integrations. CiteLadder brings tracked AI answers, cited-source analysis and Site Health into a shared project workflow.',
    context:
      'Compare the reporting questions your team needs to answer and how easily it can move from an aggregate result to the underlying evidence.',
    metaTitle: 'CiteLadder vs Peec AI for AI Search Analytics | CiteLadder',
    metaDescription:
      'Compare CiteLadder and Peec AI for AI search analytics and reporting. Review measurement definitions, source investigation and official product information.',
    sources: [
      {
        label: 'Peec AI’s official product overview',
        url: 'https://peec.ai/',
        reviewedDate: SOURCES_REVIEWED,
      },
    ],
    whenBody:
      'Include Peec AI in your evaluation when AI search analytics and recurring reporting are central requirements. Confirm the collection sources, metric definitions and reporting integrations available in your selected plan.',
    conclusionHeading: 'Compare definitions before percentages',
    conclusion:
      'Use the same business question and inspect how each product defines visibility, position and competitor presence. Check the observation set, available source context and export format. A difference between dashboard percentages can reflect a different method rather than a different underlying business outcome.',
  },
];
