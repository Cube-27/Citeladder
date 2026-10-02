/** Reviewed commercial entry-page copy. Routes remain owned by Astro pages. */
export type CommercialPage = {
  eyebrow: string;
  heading: string;
  introduction: string;
  secondary: { label: string; href: string };
  sections: readonly {
    heading: string;
    paragraphs: readonly string[];
    questions?: readonly { heading: string; body: string }[];
    note?: string;
  }[];
  contextHeading: string;
  context: string;
  /** Internal next steps rendered after the context section. */
  related: readonly { label: string; href: string }[];
  faqs: readonly { q: string; a: string }[];
  closingHeading: string;
  closing: string;
};

export const CITATION_PAGE: CommercialPage = {
  eyebrow: 'AI citation tracking',
  heading: 'See the sources behind AI answers.',
  introduction:
    'Your brand can appear in an answer while another website supplies the supporting information. AI citation tracking helps you understand which domains and pages are being referenced, so you can investigate the sources behind your visibility.',
  secondary: { label: 'Compare visibility metrics', href: '/ai-search-share-of-voice' },
  sections: [
    {
      heading: 'A mention and a citation tell you different things',
      paragraphs: [
        'A brand mention means your name appears in the answer. A citation identifies a source the answer points to. An answer may mention your brand without linking to your website, or cite one of your pages without recommending your product.',
        'Keep these observations separate. They answer different questions about how your brand and information appear.',
      ],
    },
    {
      heading: 'Look beyond the domain',
      paragraphs: [
        'A domain-level view shows which websites recur across your tracked answers. The URL-level view helps you identify the actual material being referenced: a product page, category guide, comparison, review or another resource.',
        'CiteLadder brings cited-source analysis into the same workspace as your tracked answers. Use the source context to narrow the investigation before deciding what content to change.',
      ],
    },
    {
      heading: 'Three questions to investigate',
      paragraphs: [],
      questions: [
        {
          heading: 'Are your own pages being cited?',
          body: 'Review whether the relevant page appears as a source for the questions it is meant to answer. If it does not, investigate access, relevance and the completeness of the information before drawing conclusions.',
        },
        {
          heading: 'Which outside sources appear repeatedly?',
          body: 'Look for recurring publications, directories and comparison pages. Check the underlying material for accuracy and relevance to your business.',
        },
        {
          heading: 'Do competitors appear through different sources?',
          body: 'Compare the sources associated with the same buyer questions. A pattern can help identify a research question; it does not establish why the engine selected a particular answer.',
        },
      ],
    },
    {
      heading: 'An illustrative investigation',
      paragraphs: [
        'A buyer asks about scheduling software for several clinic locations. The answer names your product but cites an independent comparison.',
        'Start by reading that comparison. Does it describe your current features correctly? Does your own product page answer the same multi-location question clearly? Are the supporting details accessible without signing in?',
        'Those checks lead to specific work: correct inaccurate information, clarify a capability, or improve an explanation. Buying links or repeating a keyword is not a substitute for that investigation.',
      ],
      note: 'This example is illustrative and is not a CiteLadder customer result.',
    },
  ],
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
  eyebrow: 'AI search share of voice',
  heading: 'Compare your brand’s presence across the questions that matter.',
  introduction:
    'Understand how your brand appears alongside competitors in a defined set of AI answers. Use consistent buyer questions, inspect the underlying responses, and give changes in visibility the context they need.',
  secondary: { label: 'Explore cited sources', href: '/ai-citation-tracking' },
  sections: [
    {
      heading: 'Start with a relevant set of questions',
      paragraphs: [
        'A useful benchmark reflects real buying decisions. Include the needs, constraints and use cases your customers care about, rather than relying only on questions that already name your brand.',
        'For a service business, that might mean delivery location, project scope and specialist experience. For a product business, it might mean compatibility, features and intended use.',
        'Keep branded and non-branded questions distinguishable so the comparison remains meaningful.',
      ],
    },
    {
      heading: 'Compare the same observation set',
      paragraphs: [
        'A competitor comparison is easier to interpret when the brands are measured against the same prompts and collection conditions. Keep the time window, engine or source, language and other available context visible.',
        'When you change the prompt portfolio, mark that change. Otherwise, a shift in the questions being asked can look like a shift in performance.',
      ],
    },
    {
      heading: 'Inspect the answers behind the pattern',
      paragraphs: [
        'An aggregate number is a starting point. Review the responses that contributed to it.',
        'Was your brand included? Was the answer a recommendation, a passing mention or a comparison? Did it cite your own website or another source? These details help your team decide what to investigate.',
      ],
    },
    {
      heading: 'Keep the measurement definition visible',
      paragraphs: [
        '“Share of voice” can refer to different calculations. A share of tracked brand appearances is different from the percentage of answers that mention your brand. Both can be useful, but they need a clear denominator.',
        'Compare like with like. Keep missing or failed observations distinguishable from completed answers where the brand was absent.',
      ],
    },
    {
      heading: 'Illustrative example',
      paragraphs: [
        'Suppose a report contains 100 completed answers. Your brand appears in 30 of them. Its answer-level mention rate is 30%.',
        'That alone does not tell you its share of all tracked brands’ appearances. Several brands can occur in the same answer, so that calculation needs the competitor counts and a stated counting rule.',
      ],
      note: 'This is a teaching example, not a product screenshot, industry benchmark or statement of CiteLadder’s current scoring formula.',
    },
  ],
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
