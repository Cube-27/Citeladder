/** Reviewed commercial entry-page copy. Routes remain owned by Astro pages. */
export type CommercialPage = {
  kind: 'share';
  /** Current-page crumb; mirrors the route's breadcrumb structured data. */
  breadcrumb: string;
  heading: string;
  introduction: string;
  secondary: { label: string; href: string };
  overview: { heading: string; lead: string };
  definitions: readonly { heading: string; body: string }[];
  workflow: { heading: string; lead: string; steps: readonly { heading: string; body: string }[] };
  contextHeading: string;
  context: string;
  /** Internal next steps rendered in the context section. */
  related: readonly { label: string; href: string }[];
  faqs: readonly { q: string; a: string }[];
  closingHeading: string;
  closing: string;
};

export const SHARE_OF_VOICE_PAGE: CommercialPage = {
  kind: 'share',
  breadcrumb: 'AI share of voice',
  heading: 'Know where your brand stands in AI answers.',
  introduction:
    'Compare your brand with competitors across a defined set of buyer questions. Keep the measurement scope visible and inspect the answers behind a change in visibility.',
  secondary: { label: 'Explore cited sources', href: '/platform/citation-intelligence' },
  overview: {
    heading: 'A percentage only helps when you know what it counts.',
    lead: '"Share of voice" can describe different calculations. Read the definition and denominator before comparing brands, tools or reporting periods.',
  },
  definitions: [
    {
      heading: 'Answer-level mention rate',
      body: 'The percentage of completed answers that mention your brand. Several brands can appear in the same answer, so their mention rates do not need to add up to 100%.',
    },
    {
      heading: 'Share of tracked brand appearances',
      body: "Your brand's portion of appearances across the brands being compared. This needs competitor counts and a stated counting rule. You cannot infer it from your mention rate alone.",
    },
  ],
  workflow: {
    heading: 'Build a comparison your team can explain.',
    lead: 'A useful benchmark starts with buyer questions and ends with the evidence behind the numbers.',
    steps: [
      {
        heading: 'Choose questions that reflect buying decisions',
        body: 'Include customer needs, constraints and use cases: location and specialist experience for a service, or compatibility and features for a product. Keep branded questions separate from non-branded discovery.',
      },
      {
        heading: 'Hold the comparison scope steady',
        body: 'Compare brands against the same prompts and collection conditions. Keep the engine, time window and language visible. Mark changes to the prompt portfolio, and distinguish failed observations from completed answers where the brand was absent.',
      },
      {
        heading: 'Inspect the answers behind a change',
        body: 'Check whether the brand was recommended, compared or simply mentioned, and which sources were cited. Use the pattern to choose a research question. Repeated observations do not prove that a website change caused the movement.',
      },
    ],
  },
  contextHeading: 'Put visibility in business context',
  context:
    'A visibility observation is not a sales result. Use it to identify questions, sources and pages worth investigating. Then examine referral visits and relevant business outcomes separately.',
  related: [
    { label: 'Citation Intelligence', href: '/platform/citation-intelligence' },
    { label: 'AI Referral Analytics', href: '/platform/ai-referral-analytics' },
    { label: 'Read the measurement guide', href: '/blog/verify-improve-ai-search-visibility' },
    { label: 'Compare AI visibility tools', href: '/compare' },
    { label: 'Explore team workflows', href: '/solutions' },
    { label: 'Review CiteLadder pricing', href: '/pricing' },
  ],
  faqs: [
    {
      q: 'Is AI share of voice the same as Google ranking?',
      a: "No. Google ranking concerns a result's position for a search. AI share of voice describes a defined comparison of brand presence in an observed answer set.",
    },
    {
      q: 'Can different tools report different numbers?',
      a: 'Yes. Prompt selection, collection source, timing, brand matching and the calculation itself can differ. Compare the methodology before comparing the percentages.',
    },
    {
      q: 'Can I compare branded questions with non-branded discovery questions?',
      a: 'You can study both, but keep them separate in interpretation. A question that names your company starts with a different context from one asking for possible suppliers.',
    },
    {
      q: 'Does improved visibility prove that a website change worked?',
      a: 'No. It may coincide with the change, but other factors can also affect an answer. Use repeated observations and a documented baseline.',
    },
  ],
  closingHeading: 'Build a benchmark your team can explain',
  closing:
    'Walk through your buyer questions with us and inspect the answers and cited sources behind each result.',
};
