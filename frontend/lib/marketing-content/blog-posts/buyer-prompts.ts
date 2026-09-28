import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';
import { BLOG_SOURCES } from '../blog-sources';

export const POST_BUYER_PROMPTS: BlogPost = {
  slug: 'ai-search-buyer-prompt-generation',
  title: 'From Keywords to Buyer Questions: How CiteLadder Builds AI Search Prompt Portfolios',
  seoTitle: 'AI Search Prompt Generation: Build Buyer Questions Worth Tracking',
  seoDescription:
    'How CiteLadder turns confirmed offerings, buyer context and business constraints into reviewable AI-search prompts instead of a noisy auto-generated keyword list.',
  excerpt:
    'A useful AI-search prompt portfolio represents real buying decisions, not every question a model can invent.',
  image: '/blog/editorial/article-prompts.png',
  cardImage: '/blog/editorial/article-prompts.svg',
  date: '2026-09-28',
  readTime: '8 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['AI Search Prompts', 'Buyer Intent', 'AI Visibility'],
  relatedSlugs: [
    'tracking-brand-visibility-ai-search',
    'track-optimize-ai-citations',
    'jev-internal-linking-citeladder',
  ],
  sources: [BLOG_SOURCES.typesafeSystemOne],
  body: [
    {
      type: 'paragraph',
      text: 'Prompt tracking is easy to get wrong. Give a language model a company URL and ask for 100 questions, and it will produce 100 questions. That does not make them a useful market, a stable measurement portfolio or the decisions real buyers make.',
    },
    {
      type: 'paragraph',
      text: 'CiteLadder takes the opposite approach. A new project starts with no prompts. The user chooses when to build the first portfolio, which business areas matter, and which suggestions are worth tracking.',
    },
    {
      type: 'callout',
      title: 'The portfolio principle',
      text: 'CiteLadder builds a representative set of questions to measure repeatedly. It does not estimate how many AI prompts exist, and a count of generated candidates is never a market size.',
      tone: 'accent',
    },
    { type: 'heading', text: 'Start with business structure, not prompt wording' },
    {
      type: 'paragraph',
      text: 'Generation begins with confirmed business context. Products or services become offerings. Each offering can carry attributes, audiences, situations or constraints, service markets and explicit exclusions for combinations that make no sense.',
    },
    {
      type: 'paragraph',
      text: 'That gives the generator a business map without pretending unknown facts are known. Confirmed entries are preferred over suggested ones, and a topic without a map gets plain questions rather than invented detail.',
    },
    {
      type: 'table',
      headers: ['Input', 'What it contributes'],
      rows: [
        ['Offering', 'The product, service or category the buyer is considering'],
        ['Attribute', 'A property that can change the choice'],
        ['Situation or constraint', 'The problem, context or limit shaping the decision'],
        ['Audience', 'Who is making or influencing the choice'],
        ['Buyer stage', 'Where the buyer is in the decision'],
        ['Market', 'Location, only when geography changes the answer'],
      ],
    },
    { type: 'heading', text: 'Generate from compatible cells, not every combination' },
    {
      type: 'paragraph',
      text: 'CiteLadder combines those inputs into a bounded set of generation cells. It never enumerates every combination: excluded pairs never share a cell, only a controlled surplus of candidates is planned, and values are spread across topics, buyer stages, audiences, situations, attributes and markets.',
    },
    {
      type: 'paragraph',
      text: 'The generative model then has a narrower job: turn each grounded cell into a natural buyer question. It is not asked to rediscover the business for every prompt.',
    },
    { type: 'heading', text: 'Code rejects what code can know' },
    {
      type: 'checklist',
      title: 'Deterministic admission, before any model judgment',
      items: [
        {
          title: 'Duplicates',
          description:
            'Exact normalized duplicates of tracked or already-pending prompts are removed.',
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
          title: 'Structure',
          description:
            'Length limits and allowed labels are checked without spending a model call.',
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
      text: 'For each admitted candidate, Jev answers fixed questions: does the prompt fit the business, matter to a prospective buyer, express a real decision, read naturally, stand on its own and make sense? It also checks whether the candidate duplicates a prompt already tracked under the same topic. The state it receives includes the business facts and the question, but never the brand or competitor names.',
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
    { type: 'heading', text: 'Suggestions stay candidates until you accept them' },
    {
      type: 'paragraph',
      text: 'Generated rows are staged outside the active prompt library. They do not use prompt capacity, enter audits or affect visibility reporting until the user accepts them. The review screen lets you accept the useful subset and reject the rest.',
    },
    {
      type: 'paragraph',
      text: 'This boundary protects measurement. If proposals lived beside active prompts, every audit, quota and visibility query would have to remember to exclude them. Keeping them apart means a prompt becomes measurement input only after an explicit decision.',
    },
    { type: 'heading', text: 'A stable baseline beats an exhaustive list' },
    {
      type: 'paragraph',
      text: 'A smaller, coherent portfolio is easier to rerun, compare and explain. The point is to see how a brand, its competitors and their sources appear across representative buying questions over time.',
    },
    {
      type: 'paragraph',
      text: 'Generating suggestions and running an audit are separate actions. Generation never launches provider measurements on its own: you review the portfolio first, then choose when and where to run it.',
    },
    {
      type: 'diagram',
      title: 'The prompt-generation pipeline',
      variant: 'flow',
      data: {
        steps: [
          {
            step: '01',
            title: 'Map',
            desc: 'Use confirmed offerings, attributes, audiences and markets.',
          },
          {
            step: '02',
            title: 'Generate',
            desc: 'Write natural buyer questions from compatible cells.',
          },
          {
            step: '03',
            title: 'Admit',
            desc: 'Apply duplicate, brand, binding and evidence rules in code.',
          },
          {
            step: '04',
            title: 'Judge',
            desc: 'Ask Jev bounded quality questions about each candidate.',
          },
          { step: '05', title: 'Review', desc: 'Accept only the candidates worth tracking.' },
          {
            step: '06',
            title: 'Measure',
            desc: 'Run the approved portfolio across the AI-search engines you choose.',
          },
        ],
      },
    },
    { type: 'heading', text: 'What the workflow avoids' },
    {
      type: 'list',
      items: [
        'Creating prompts during onboarding, before you have seen the project context.',
        'Treating a count of generated candidates as market size or search volume.',
        'Copying private search queries verbatim into tracked prompts.',
        'Activating generated prompts before review.',
        'Using one model as generator, validator, judge and final authority.',
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Once the portfolio is active, the next job is evidence: use ',
        {
          type: 'link',
          text: 'AI visibility measurement',
          href: '/blog/tracking-brand-visibility-ai-search',
        },
        ' to set a repeatable baseline, then inspect ',
        {
          type: 'link',
          text: 'the sources winning each prompt',
          href: '/blog/track-optimize-ai-citations',
        },
        ' before deciding what to change. See how teams put this together in ',
        { type: 'link', text: 'CiteLadder solutions', href: '/solutions' },
        '.',
      ],
    },
  ],
};
