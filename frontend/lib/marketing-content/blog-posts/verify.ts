import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';

export const POST_VERIFY: BlogPost = {
  slug: 'verify-improve-ai-search-visibility',
  title: 'How to measure AI visibility without losing the context.',
  seoTitle: 'How to Measure AI Visibility and Share of Voice | CiteLadder',
  seoDescription:
    'Build an AI visibility baseline with consistent prompts, clear counting rules and answer-level evidence. Learn what mentions, citations and share of voice mean.',
  excerpt:
    'Define the questions, count the observations and keep the denominator visible. A practical approach to measuring brand presence in AI answers.',
  image: '/blog/editorial/article-verify.png',
  cardImage: '/blog/editorial/article-verify.svg',
  date: '2026-09-03',
  dateModified: '2026-09-09',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['Measurement'],
  relatedSlugs: [
    'tracking-brand-visibility-ai-search',
    'track-optimize-ai-citations',
    'action-playbook-winning-ai-citations',
  ],
  sources: [],
  editorialNote:
    'Updated to clarify measurement definitions, evidence limits and practical checks.',
  closing: {
    secondary: { href: '/solutions', label: 'Explore team workflows' },
    heading: 'Build a visibility baseline your team can explain.',
    body: 'Walk through your buyer questions and the evidence behind the observations with CiteLadder.',
  },
  body: [
    {
      type: 'paragraph',
      text: 'An AI visibility report is useful when someone else can understand how it was produced. A percentage without a prompt set, time window or counting rule makes it difficult to decide whether the result matters.',
    },
    {
      type: 'paragraph',
      text: 'Start with a small, explainable measurement design. Expand it when you know what each observation represents.',
    },
    { type: 'heading', text: 'Start with a buying decision' },
    {
      type: 'paragraph',
      text: 'Choose one audience and one decision you want to understand. A broad question such as “best software” mixes too many needs. A question about scheduling software for several clinic locations provides a clearer starting point.',
    },
    { type: 'paragraph', text: 'Include several types of question:' },
    {
      type: 'list',
      items: [
        'Discovery: which options address the need?',
        'Evaluation: what capabilities or limitations matter?',
        'Comparison: how do the shortlisted options differ?',
        'Branded: what does an answer say when the buyer already knows your name?',
      ],
    },
    {
      type: 'paragraph',
      text: 'Label these groups. A branded question and a non-branded discovery question should not be treated as equivalent evidence of discoverability.',
    },
    { type: 'heading', text: 'Define the observation' },
    {
      type: 'paragraph',
      text: 'Decide what one observation means before collecting results. A practical definition is one completed response to one prompt under recorded collection conditions.',
    },
    {
      type: 'paragraph',
      text: 'Record the prompt, collection source, available model or engine identifier, date, language and relevant settings. Keep the answer and its source references. If a result fails, retain the failure status so it does not disappear from the coverage picture.',
    },
    {
      type: 'paragraph',
      text: 'If results come from a provider API, label them that way. Do not describe them as a complete record of what all users see in a consumer app.',
    },
    { type: 'heading', text: 'Separate the metrics' },
    {
      type: 'paragraph',
      text: 'Answer-level mention rate asks how many completed answers include the brand. Count a brand at most once per answer for this metric, even if its name appears repeatedly.',
    },
    {
      type: 'paragraph',
      text: 'Citation rate asks how often an observed answer references a defined website or set of URLs. Specify whether you mean your own domain, any source associated with your company, or some other rule.',
    },
    {
      type: 'paragraph',
      text: 'Share of tracked brand appearances compares one brand’s appearances with the total appearances of the named brands being monitored. Name the competitor set and the counting rule.',
    },
    {
      type: 'paragraph',
      text: 'These are suggested measurement definitions for this guide. A product may use another documented definition. Read that definition before comparing percentages.',
    },
    { type: 'heading', text: 'Work through the denominator' },
    {
      type: 'paragraph',
      text: 'Consider an illustrative test with 100 completed answers. Brand A appears in 30 answers, Brand B in 50 and Brand C in 20. A response may contain more than one brand.',
    },
    {
      type: 'paragraph',
      text: 'Brand A’s answer-level mention rate is 30 divided by 100, or 30%.',
    },
    {
      type: 'paragraph',
      text: 'Under a rule that counts each tracked brand once per answer, Brand A has 30 of the 100 total tracked brand appearances, also 30%. Those percentages happen to match in this example; they describe different denominators.',
    },
    {
      type: 'paragraph',
      text: 'If Brand B instead appears in 70 answers while the other counts stay the same, Brand A’s mention rate remains 30%, but its share of tracked appearances becomes 30 divided by 120, or 25%.',
    },
    { type: 'paragraph', text: 'This is why a report should state what is being divided by what.' },
    { type: 'callout', text: 'All numbers in this example are illustrative.', tone: 'info' },
    { type: 'heading', text: 'Show coverage as well as performance' },
    {
      type: 'paragraph',
      text: 'Suppose you intended to collect 120 answers and obtained 100. Report 100 completed observations out of 120 intended, alongside the visibility calculation.',
    },
    {
      type: 'paragraph',
      text: 'Do not silently count the 20 missing results as answers that excluded the brand. Also avoid presenting only the completed sample as though collection was complete. If failures cluster around one engine or prompt type, the comparison may be biased.',
    },
    { type: 'heading', text: 'Keep comparisons stable' },
    {
      type: 'paragraph',
      text: 'Use the same prompt portfolio and consistent collection settings when comparing periods. Note changes in model, provider, source, language or sampling.',
    },
    {
      type: 'paragraph',
      text: 'Repeat observations where possible instead of making a strong claim from a single answer. Keep branded and non-branded groups distinguishable, and inspect engine-specific results before combining them.',
    },
    {
      type: 'paragraph',
      text: 'If you add a new set of prompts, show that change in the report. A better-looking score can result from easier questions rather than a real improvement for the original audience.',
    },
    { type: 'heading', text: 'Investigate the responses' },
    {
      type: 'paragraph',
      text: 'Read examples behind the aggregate. Was the brand recommended, merely listed, or discussed negatively? Did a cited source describe the current product accurately? Did the answer misunderstand the buyer’s requirements?',
    },
    {
      type: 'paragraph',
      text: 'Those checks turn a visibility report into a useful work list. They also help catch brand-matching errors and misleading summaries.',
    },
    { type: 'heading', text: 'Connect the finding to a business question' },
    {
      type: 'paragraph',
      text: 'Mentions and citations are not visits or sales. Keep referral traffic and business conversions in their own measurements, then investigate whether the patterns are consistent.',
    },
    {
      type: 'paragraph',
      text: 'After changing a page, record what changed and when. Compare later observations with the baseline, while acknowledging that engines, sources and other websites can also change. An increase after publication is not sufficient proof that the edit caused it.',
    },
    { type: 'heading', text: 'A practical reporting checklist' },
    { type: 'paragraph', text: 'Before sharing a report, include:' },
    {
      type: 'list',
      items: [
        'Audience and question set',
        'Branded versus non-branded grouping',
        'Collection source and observation dates',
        'Intended and completed sample sizes',
        'Brand-matching and counting rules',
        'Numerators and denominators',
        'Competitor set',
        'Examples of underlying answers',
        'Changes in collection conditions',
        'Limitations and the next question to investigate',
      ],
    },
    { type: 'heading', text: 'Continue the workflow' },
    {
      type: 'richParagraph',
      content: [
        'Explore ',
        { type: 'link', text: 'AI search share of voice', href: '/ai-search-share-of-voice' },
        ', learn how to ',
        {
          type: 'link',
          text: 'investigate AI citations',
          href: '/blog/action-playbook-winning-ai-citations',
        },
        ', or review the distinction between ',
        {
          type: 'link',
          text: 'AI visibility and referral tracking',
          href: '/blog/tracking-brand-visibility-ai-search',
        },
        '.',
      ],
    },
  ],
};
