/** Reviewed commercial entry-page copy. Routes remain owned by Astro pages. */
export type CommercialPage = {
  kind: 'citation' | 'share';
  eyebrow: string;
  heading: string;
  introduction: string;
  secondary: { label: string; href: string };
  overview: { heading: string; lead: string };
  definitions: readonly { heading: string; body: string }[];
  workflow: { heading: string; lead: string; steps: readonly { heading: string; body: string }[] };
  contextHeading: string;
  context: string;
  /** Internal next steps rendered after the context section. */
  related: readonly { label: string; href: string }[];
  faqs: readonly { q: string; a: string }[];
  closingHeading: string;
  closing: string;
};

export const CITATION_PAGE: CommercialPage = {
  kind: 'citation',
  eyebrow: 'AI citation tracking',
  heading: 'See the sources behind AI answers.',
  introduction:
    'Find the domains and pages referenced in your tracked AI answers. Separate a brand mention from a source citation, then investigate the evidence behind your visibility.',
  secondary: { label: 'Compare visibility metrics', href: '/ai-search-share-of-voice' },
  overview: {
    heading: 'Your brand is in the answer. Is your website the source?',
    lead: 'CiteLadder brings cited-source analysis together with your tracked answers. Keep these two observations separate to understand what actually appeared.',
  },
  definitions: [
    {
      heading: 'Brand mention',
      body: 'Your brand, product or domain appears in the answer. It may be a recommendation, a comparison or a passing reference. It does not mean your website was cited.',
    },
    {
      heading: 'Source citation',
      body: 'The answer points to a source. That may be your own page, a competitor’s site or a third-party publication. A citation is not necessarily a recommendation.',
    },
  ],
  workflow: {
    heading: 'Turn a source reference into a useful next step.',
    lead: 'Move from the observed answer to the exact page, then decide what deserves attention.',
    steps: [
      {
        heading: 'Read the answer in context',
        body: 'Start with the buyer question. Check how your brand appears and which sources the answer references. Compare competitors against the same question.',
      },
      {
        heading: 'Investigate the domain and the URL',
        body: 'Look for recurring sources, then read the actual page: a guide, product page, review or comparison. Is the information current and relevant? Does your own page answer the same question clearly?',
      },
      {
        heading: 'Choose the work the evidence supports',
        body: 'Correct an inaccurate third-party statement through the publisher’s correction process. For owned pages, investigate access, relevance and missing detail. A source pattern does not establish why an engine chose it.',
      },
    ],
  },
  contextHeading: 'Use citations alongside visibility and traffic',
  context:
    'A citation is evidence of a source reference in an observed answer. It does not by itself measure a visit, a lead or a sale. Pair source analysis with your tracked brand observations and your website analytics to understand the different stages.',
  related: [
    { label: 'Explore AI share of voice', href: '/ai-search-share-of-voice' },
    {
      label: 'Learn how to investigate a citation',
      href: '/blog/action-playbook-winning-ai-citations',
    },
    { label: 'Compare AI visibility tools', href: '/compare' },
    { label: 'Explore team workflows', href: '/solutions' },
    { label: 'Review CiteLadder pricing', href: '/pricing' },
  ],
  faqs: [
    {
      q: 'Does being mentioned mean my website was cited?',
      a: 'No. The answer may name your brand while using another source, or it may include no source link at all.',
    },
    {
      q: 'Does a citation guarantee referral traffic?',
      a: 'No. A person can read an answer without opening its sources. Use website analytics to measure the visits that actually reach your site.',
    },
    {
      q: 'Can I use this to guarantee that an AI engine cites me?',
      a: 'No. Citation tracking helps you inspect observed answers and investigate changes. It cannot force an engine to select a source.',
    },
    {
      q: 'What should I do when a third-party source is inaccurate?',
      a: 'Document the specific statement and the evidence for a correction. Use the publisher’s normal correction process rather than assuming every missing citation is a technical problem on your own site.',
    },
  ],
  closingHeading: 'Review the evidence for your category',
  closing: 'See how source analysis can support your team’s AI visibility work.',
};

export const SHARE_OF_VOICE_PAGE: CommercialPage = {
  kind: 'share',
  eyebrow: 'AI search share of voice',
  heading: 'Know where your brand stands in AI answers.',
  introduction:
    'Compare your brand with competitors across a defined set of buyer questions. Keep the measurement scope visible and inspect the answers behind a change in visibility.',
  secondary: { label: 'Explore cited sources', href: '/ai-citation-tracking' },
  overview: {
    heading: 'A percentage only helps when you know what it counts.',
    lead: '“Share of voice” can describe different calculations. Read the definition and denominator before comparing brands, tools or reporting periods.',
  },
  definitions: [
    {
      heading: 'Answer-level mention rate',
      body: 'The percentage of completed answers that mention your brand. Several brands can appear in the same answer, so their mention rates do not need to add up to 100%.',
    },
    {
      heading: 'Share of tracked brand appearances',
      body: 'Your brand’s portion of appearances across the brands being compared. This needs competitor counts and a stated counting rule. It cannot be inferred from your mention rate alone.',
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
    { label: 'Investigate AI citations', href: '/ai-citation-tracking' },
    { label: 'Read the measurement guide', href: '/blog/verify-improve-ai-search-visibility' },
    { label: 'Compare AI visibility tools', href: '/compare' },
    { label: 'Explore team workflows', href: '/solutions' },
    { label: 'Review CiteLadder pricing', href: '/pricing' },
  ],
  faqs: [
    {
      q: 'Is AI share of voice the same as Google ranking?',
      a: 'No. Google ranking concerns a result’s position for a search. AI share of voice describes a defined comparison of brand presence in an observed answer set.',
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
    'Walk through your buyer questions and see how CiteLadder can support a more inspectable AI visibility workflow.',
};
