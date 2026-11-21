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
  updated: string;
  sources: readonly ComparisonSource[];
  whenBody: string;
  openSource: string;
  conclusionHeading: string;
  conclusion: string;
};

const SOURCES_REVIEWED = '2026-10-02';

export const COMPARISON_DISCLOSURE =
  'This comparison is written by CiteLadder. It summarizes public product information and provides evaluation questions. It is not an independent review or a promise that every feature is included in every plan.';

export const CITELADDER_POSITION = {
  focus:
    'Records AI answers to your prompts, analyses the sources they cite and checks your own pages in Site Health, in one project.',
  when: 'You want to open a recorded answer, follow the sources it cites and check the matching findings on your own site.',
  openSource:
    'The source, including the visibility scoring, is public under AGPL-3.0; run it yourself or use the hosted version.',
} as const;

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
    updated: '2026-11-05',
    name: 'Profound',
    tagline:
      'A broad AI marketing platform: answer-engine insights, prompt intelligence, agent analytics and marketing agents.',
    lead: 'Profound presents a broad AI marketing platform with answer-engine insights, prompt intelligence, agent analytics and marketing agents. CiteLadder records AI answers to your prompts, analyses the sources they cite and checks your own site.',
    context:
      'Start from the work your team has to do. That might be monitoring a fixed set of questions, investigating the sources behind the answers, or running a wider set of marketing workflows.',
    metaTitle: 'CiteLadder vs Profound for AI visibility | CiteLadder',
    metaDescription:
      'Compare CiteLadder and Profound by product focus, evidence access and workflow needs. Use a practical checklist and current official product sources.',
    sources: [
      {
        label: "Profound's official product overview",
        url: 'https://www.tryprofound.com/',
        reviewedDate: SOURCES_REVIEWED,
      },
    ],
    whenBody:
      'Include Profound in your evaluation if a broad AI marketing platform and agent-based marketing workflows are central to your requirements. Ask which capabilities are included in the plan you are considering and how the underlying observations can be inspected.',
    openSource:
      'Hosted service sold as a tailored Enterprise plan with a free trial. Its official site lists no public source code or self-hosted edition (reviewed 20 October 2026).',
    conclusionHeading: 'A practical way to compare',
    conclusion:
      'Bring the same small prompt portfolio and one investigation to both demos. For example, ask how a team would examine a competitor mention, find the source behind it and document a next action. Compare the evidence, workflow effort and relevant commercial terms.',
  },
  {
    slug: 'otterly-ai',
    updated: '2026-11-05',
    name: 'Otterly AI',
    tagline:
      'AI search monitoring and optimization: brand visibility, cited sources and website-related recommendations.',
    lead: 'Otterly AI presents an AI search monitoring and optimization workflow covering brand visibility, cited sources and website-related recommendations. CiteLadder links each tracked answer to the sources it cites and to Site Health findings on your pages.',
    context:
      'Compare how each product handles the questions you track, and what you can do in each one when a result changes.',
    metaTitle: 'CiteLadder vs Otterly AI for AI search monitoring | CiteLadder',
    metaDescription:
      'Compare CiteLadder and Otterly AI for monitoring and citation investigation. Review evaluation questions, evidence access and official product information.',
    sources: [
      {
        label: "Otterly AI's official product overview",
        url: 'https://otterly.ai/',
        reviewedDate: SOURCES_REVIEWED,
      },
    ],
    whenBody:
      'Include Otterly AI in your evaluation when recurring AI search monitoring and related optimization work are the starting point. Confirm the exact engine selection, observation cadence, reporting and usage limits for the proposed plan.',
    openSource:
      'Hosted service with published subscription tiers. Its official site lists no public source code or self-hosted edition (reviewed 20 October 2026).',
    conclusionHeading: 'Test what happens after a result changes',
    conclusion:
      'Choose a prompt where your brand and a competitor appear differently. Ask to inspect the answer, citation details and the route from that observation to a specific task. Compare how much context survives when the finding is exported or shared.',
  },
  {
    slug: 'scrunch-ai',
    updated: '2026-11-05',
    name: 'Scrunch',
    tagline:
      'AI visibility monitoring, content diagnostics, bot observability and agent delivery through its Agent Experience Platform.',
    lead: 'Scrunch describes a platform spanning AI visibility monitoring, content diagnostics, bot observability and its Agent Experience Platform for agent delivery. CiteLadder records AI answers, shows the sources they cite and reports findings on your own website.',
    context:
      'Monitoring, site diagnostics and changes to how content is delivered are separate requirements. Evaluate each one on its own.',
    metaTitle: 'CiteLadder vs Scrunch for AI search visibility | CiteLadder',
    metaDescription:
      'Compare CiteLadder and Scrunch across visibility investigation, site diagnostics and workflow needs. Review the questions to ask and official product sources.',
    sources: [
      {
        label: "Scrunch's official platform overview",
        url: 'https://scrunch.com/',
        reviewedDate: SOURCES_REVIEWED,
      },
    ],
    whenBody:
      'Include Scrunch in your evaluation if agent traffic observability or agent-specific content delivery is an important part of the project. Ask what implementation is required, how content consistency is maintained and which capabilities are included in the selected plan.',
    openSource:
      'Hosted service, part of Sitecore since June 2026. Its official site lists no public source code or self-hosted edition (reviewed 20 October 2026).',
    conclusionHeading: 'Separate the observation from the intervention',
    conclusion:
      'Ask each vendor to show how it identifies a visibility issue and what it proposes changing. If the proposal affects delivery infrastructure, review rollout, verification and rollback requirements separately from reporting requirements.',
  },
  {
    slug: 'peec-ai',
    updated: '2026-11-05',
    name: 'Peec AI',
    tagline:
      'AI search analytics for marketing teams, with visibility reporting and reporting/export integrations.',
    lead: 'Peec AI presents AI search analytics for marketing teams, with visibility reporting and reporting/export integrations. CiteLadder keeps tracked AI answers, the sources they cite and Site Health findings in one shared project.',
    context:
      'List the reporting questions your team has to answer. Then check how quickly each product takes you from a summary number to the answers behind it.',
    metaTitle: 'CiteLadder vs Peec AI for AI search analytics | CiteLadder',
    metaDescription:
      'Compare CiteLadder and Peec AI for AI search analytics and reporting. Review measurement definitions, source investigation and official product information.',
    sources: [
      {
        label: "Peec AI's official product overview",
        url: 'https://peec.ai/',
        reviewedDate: SOURCES_REVIEWED,
      },
    ],
    whenBody:
      'Include Peec AI in your evaluation when AI search analytics and recurring reporting are central requirements. Confirm the collection sources, metric definitions and reporting integrations available in your selected plan.',
    openSource:
      'Hosted service with plans sized by prompts and models. Its official site lists no public source code or self-hosted edition (reviewed 20 October 2026).',
    conclusionHeading: 'Compare definitions before percentages',
    conclusion:
      'Use the same business question and inspect how each product defines visibility, position and competitor presence. Check the observation set, the source detail you can see and the export format. Two dashboards can show different percentages for the same business because they measure it differently.',
  },
];
