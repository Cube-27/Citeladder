import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';
import { BLOG_SOURCES } from '../blog-sources';

export const POST_BUYER_PROMPTS: BlogPost = {
  slug: 'ai-search-buyer-prompt-generation',
  title: 'From keywords to buyer questions: how CiteLadder builds AI search prompt portfolios',
  seoTitle: 'AI Search Prompt Generation: Build Buyer Questions Worth Tracking',
  seoDescription:
    'How the CiteLadder Prompt Builder turns your offerings, topics and chosen mix into short, reviewable buyer questions instead of a noisy auto-generated keyword list.',
  excerpt:
    'A useful AI-search prompt portfolio represents real buying decisions, not every question a model can invent.',
  image: '/blog/editorial/article-prompts.png',
  cardImage: '/blog/editorial/article-prompts.svg',
  date: '2026-09-28',
  dateModified: '2026-11-03',
  readTime: '9 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['AI Search Prompts', 'Buyer Intent', 'AI Visibility'],
  relatedSlugs: ['jev-internal-linking-citeladder'],
  sources: [BLOG_SOURCES.typesafeSystemOne],
  body: [
    {
      type: 'paragraph',
      text: 'Prompt tracking is easy to get wrong. Give a language model a company URL and ask for 100 questions, and it will produce 100 questions. That does not make them a useful market, a stable measurement portfolio or the decisions real buyers make.',
    },
    {
      type: 'paragraph',
      text: 'CiteLadder takes the opposite approach. A new project starts with no prompts. You build the first portfolio in the Prompt Builder on Prompts: you confirm what you sell, choose the topics, set the mix of questions, and accept only the suggestions worth tracking.',
    },
    { type: 'heading', text: 'A portfolio, not a prompt universe' },
    {
      type: 'callout',
      title: 'The portfolio principle',
      text: 'CiteLadder builds a representative set of questions to measure repeatedly. It does not estimate how many AI prompts exist, and a count of generated candidates is never a market size.',
      tone: 'accent',
    },
    {
      type: 'paragraph',
      text: 'The bar for a good prompt is simple: a short question a buyer would actually type, which an answer engine can only answer well by naming a business. "What should a small ecommerce team use to understand repeat purchases?" passes. A forty-word brief stacking three needs does not.',
    },
    {
      type: 'diagram',
      title: 'The Prompt Builder pipeline',
      variant: 'flow',
      data: {
        steps: [
          {
            step: '01',
            title: 'Describe',
            desc: 'Confirm what you sell, who buys it and the situations that shape the choice.',
          },
          {
            step: '02',
            title: 'Topics',
            desc: 'Keep, rename or add buyer-facing topics grounded in your offerings.',
          },
          {
            step: '03',
            title: 'Mix',
            desc: 'Set the count, branded and comparison shares, intent mix and search data.',
          },
          {
            step: '04',
            title: 'Generate',
            desc: 'Write one short buyer question per planned cell, then apply rules in code.',
          },
          {
            step: '05',
            title: 'Judge',
            desc: 'Ask Jev bounded quality questions about each candidate.',
          },
          {
            step: '06',
            title: 'Review',
            desc: 'Check coverage and accept what is worth tracking.',
          },
        ],
      },
    },
    { type: 'heading', text: 'Step 1: start with business structure, not prompt wording' },
    {
      type: 'paragraph',
      text: 'The first step, About your business, is prefilled from your project. Products or services become offerings, entered one at a time so a name containing a comma stays one offering. Each offering can carry the people who buy it, the situations or constraints that shape the choice and the attributes that change it. Buyer roles, service areas for local and regional businesses, category terms, jobs to be done and your business model complete the map.',
    },
    {
      type: 'paragraph',
      text: 'That gives the generator a business map without pretending unknown facts are known. Confirmed entries are preferred over suggested ones, and a topic without a map gets plain questions rather than invented detail. A one-line note for this run only lets you steer a single generation without changing saved facts.',
    },
    {
      type: 'table',
      headers: ['Input', 'What it contributes'],
      rows: [
        ['Offering', 'The product, service or category the buyer is considering'],
        ['Attribute', 'A property that can change the choice'],
        ['Situation or constraint', 'The problem, context or limit shaping the decision'],
        ['Audience', 'Who is making or influencing the choice'],
        ['Buyer stage', 'Awareness, consideration or decision'],
        ['Market', 'Location, only when geography changes the answer'],
      ],
    },
    { type: 'heading', text: 'Step 2: topics a buyer would recognise' },
    {
      type: 'paragraph',
      text: 'Topics are the categories a buyer shops in, not your product-line names. Suggest topics asks a model for categories once, and code then keeps only names grounded in a saved offering, strips your brand and product-line names, and merges near-duplicates. You rename, remove or add topics and confirm the plan in one step; nothing is written before you confirm.',
    },
    {
      type: 'paragraph',
      text: 'Topics are weighted by how many of your offerings they cover. Every topic gets a question before any gets a second, and the rest follow that weight, so your core category is not given the same share as a niche accessory.',
    },
    { type: 'heading', text: 'Step 3: you choose the mix' },
    {
      type: 'paragraph',
      text: 'The Distribution step decides what kind of portfolio you get, instead of leaving it to the model.',
    },
    {
      type: 'checklist',
      title: 'What the Distribution step controls',
      items: [
        {
          title: 'Count',
          description: 'How many prompts this run should produce.',
        },
        {
          title: 'Branded share',
          description:
            'The share of questions that name your brand, 20% by default. The rest are discovery questions that never name you or a competitor.',
        },
        {
          title: 'Competitor alternatives',
          description:
            'The share of comparison questions. It stays off, with the reason shown, until you track a competitor.',
        },
        {
          title: 'Intent mix',
          description:
            'How questions spread across awareness, consideration and decision, 25/50/25 by default.',
        },
        {
          title: 'Personas',
          description: 'Which buyer roles from step 1 the questions are balanced across.',
        },
        {
          title: 'Search data',
          description:
            'Whether to borrow wording from Search Console or published keyword research, with each search listed by topic so you can untick any you do not want used.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'Each group is filled on its own. If one group comes up short, another does not quietly fill the gap, so the mix you asked for is the mix you can check.',
    },
    { type: 'heading', text: 'Generate from compatible cells, not every combination' },
    {
      type: 'paragraph',
      text: 'CiteLadder combines those inputs into a bounded set of generation cells. It never enumerates every combination. Each cell carries exactly one buyer constraint or audience, so every question asks about one need. Excluded pairs never share a cell, only a controlled surplus of candidates is planned, and questions about using a product after purchase are never planned.',
    },
    {
      type: 'paragraph',
      text: 'The generative model then only has to turn each grounded cell into a natural buyer question. It is not asked to rediscover the business for every prompt. A branded question may describe your offering only with attributes you confirmed, never with one a model suggested.',
    },
    { type: 'heading', text: 'Code rejects what code can know' },
    {
      type: 'checklist',
      title: 'Deterministic admission, before any model judgment',
      items: [
        {
          title: 'Duplicates',
          description:
            'Exact duplicates of tracked or pending prompts are removed, and so are near-duplicates that share most of their words, across topics as well as within one.',
        },
        {
          title: 'Length',
          description: 'A question over 16 words is dropped without spending a model call.',
        },
        {
          title: 'One need',
          description:
            'A discovery or branded question that joins alternatives with "or" is dropped. Comparisons ask "X or Y" by design and are exempt.',
        },
        {
          title: 'Brand rules',
          description:
            'Discovery questions cannot name your brand or a supplied competitor; diagnostic and comparison questions keep their own rules.',
        },
        {
          title: 'Topical binding',
          description:
            'A suggestion must stay connected to its topic instead of drifting into a generic adjacent market.',
        },
        {
          title: 'Observed demand',
          description:
            'A generated question cannot be a verbatim copy of a search query from your connected data.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'The order matters. Models are useful for semantic ambiguity; they should not be paid to check rules a validator can enforce exactly.',
    },
    { type: 'heading', text: 'Jev judges quality; it does not write prompts' },
    {
      type: 'richParagraph',
      content: [
        'TypeSafe describes its System One models, including Jev, as returning typed answers and probabilities rather than generated text. ',
        { type: 'citation', sourceId: 'typesafe-system-one' },
        ' CiteLadder uses Jev as a quality check after deterministic admission.',
      ],
    },
    {
      type: 'paragraph',
      text: 'For each admitted candidate, Jev answers fixed questions in one call: does the prompt fit the business, matter to a prospective buyer, express a real decision, read naturally, stand on its own and make sense? Does it ask about a single need, and would a good answer have to name a business? A branded question is also checked against the offerings and attributes you confirmed, so it cannot make a claim about you that you never made. When a run spans several topics, Jev picks the topic the question is really about, and a confident answer files it there. It also checks whether the candidate duplicates a prompt already tracked under the same topic. The state it receives includes the business facts and the question, but never the brand or competitor names.',
    },
    {
      type: 'paragraph',
      text: 'A clear fail never reaches the review list. An uncertain answer keeps the candidate but flags it for review. If Jev is unavailable, the candidate stays reviewable and is marked as unchecked; nothing claims a check that did not happen.',
    },
    {
      type: 'callout',
      title: 'Probabilities are not business scores',
      text: 'A Jev probability answers one specific question about one candidate. It is not a score for your company, market demand, search volume or commercial importance.',
      tone: 'info',
    },
    { type: 'heading', text: 'Step 4: review against the mix you asked for' },
    {
      type: 'paragraph',
      text: 'Generated rows are staged outside the active prompt library. They do not use prompt capacity, enter audits or affect visibility reporting until you accept them. The review step shows a coverage line for each topic and each segment of the mix, marked on target, short or empty. A short or empty line offers More, which reruns the same request for just that topic or segment.',
    },
    {
      type: 'paragraph',
      text: 'This boundary protects measurement. If proposals lived beside active prompts, every audit, quota and visibility query would have to remember to exclude them. Keeping them apart means a prompt becomes measurement input only after an explicit decision.',
    },
    { type: 'heading', text: 'The Agent and your assistant plan; you accept' },
    {
      type: 'paragraph',
      text: 'In the in-app Agent, prompt discovery reads your business facts, current portfolio and search data and writes a short prompt plan: which topics to keep, rename or add, which searches to use and what mix to run. It contains no prompt wording, and Open Prompt Builder takes you to the builder to act on it.',
    },
    {
      type: 'paragraph',
      text: 'An assistant connected over MCP with changes allowed can follow the same steps: preview and confirm topics, offer your search data and start a run once you agree. Its suggestions wait in Prompts like any other run, and only Accept in the app tracks them.',
    },
    { type: 'heading', text: 'A stable baseline beats an exhaustive list' },
    {
      type: 'paragraph',
      text: 'A smaller, coherent portfolio is easier to rerun, compare and explain. The point is to see how a brand, its competitors and their sources appear across representative buying questions over time.',
    },
    {
      type: 'paragraph',
      text: 'Generating suggestions and running an audit are separate actions. Generation never launches provider measurements on its own. You review the portfolio first, then choose when and where to run it.',
    },
    { type: 'heading', text: 'What the workflow avoids' },
    {
      type: 'list',
      items: [
        'Creating prompts during onboarding, before you have seen the project context.',
        'Treating a count of generated candidates as market size or search volume.',
        'Long questions that stack several needs into one prompt.',
        'Branded questions that claim attributes you never confirmed.',
        'Copying private search queries verbatim into tracked prompts.',
        'Activating generated prompts before review.',
        'Using one model as generator, validator, judge and final authority.',
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Once the portfolio is active, use ',
        {
          type: 'link',
          text: 'AI visibility measurement',
          href: '/blog/verify-improve-ai-search-visibility',
        },
        ' to set a repeatable baseline, then inspect ',
        {
          type: 'link',
          text: 'the sources winning each prompt',
          href: '/ai-citation-tracking',
        },
        ' before deciding what to change. See how teams put this together in ',
        { type: 'link', text: 'CiteLadder solutions', href: '/solutions' },
        '.',
      ],
    },
  ],
};
