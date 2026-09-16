import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';

export const POST_TRACK: BlogPost = {
  slug: 'tracking-brand-visibility-ai-search',
  title: 'How to Measure Brand Presence in AI Search',
  seoTitle: 'How to Measure Brand Presence in AI Search',
  seoDescription:
    'Measure AI brand visibility with mentions, citations, recommendations, share of voice, AI referral traffic, native platform reports, and competitor benchmarks.',
  excerpt:
    'Four evidence streams answer different questions: referral visits, Google AI impressions, Bing citation activity, and controlled prompt observations. Keep them apart.',
  image: '/blog/editorial/article-track.png',
  cardImage: '/blog/editorial/article-track.svg',
  date: '2026-09-03',
  dateModified: '2026-09-16',
  readTime: '11 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['Measurement', 'AI Visibility', 'Share of Voice'],
  relatedSlugs: [
    'track-optimize-ai-citations',
    'connecting-owned-evidence-ai-search',
    'verify-improve-ai-search-visibility',
  ],
  sources: [
    {
      id: 'ga-ai-assistant',
      title: 'Default channel group: AI Assistant',
      publisher: 'Google Analytics Help',
      url: 'https://support.google.com/analytics/answer/9756891?hl=en',
    },
    {
      id: 'gsc-ai-report',
      title: 'Generative AI performance report (Search)',
      publisher: 'Google Search Console Help',
      url: 'https://support.google.com/webmasters/answer/16984139?hl=en',
    },
    {
      id: 'bing-ai-preview',
      title: 'Introducing AI Performance in Bing Webmaster Tools',
      publisher: 'Bing Webmaster Blog',
      url: 'https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview',
    },
    {
      id: 'bing-ai-performance',
      title: 'AI Performance in Bing Webmaster Tools',
      publisher: 'Bing Webmaster Tools',
      url: 'https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c',
    },
  ],
  body: [
    {
      type: 'paragraph',
      text: 'Traditional analytics reports where a page ranks, how many people visit, and which queries produce clicks. None of it answers what happens when a buyer asks an assistant which companies to consider. An answer can name several brands, recommend one, cite supporting sources, and settle a shortlist before anyone reaches a website.',
    },
    {
      type: 'paragraph',
      text: 'Measuring brand presence in AI search means combining evidence streams that answer different questions. Some come from native analytics platforms. Others come from repeated observations of a fixed prompt portfolio across answer engines. They should not be collapsed into one universal score.',
    },
    { type: 'heading', text: 'What brand presence in AI search means' },
    {
      type: 'paragraph',
      text: 'Presence is broader than counting how often a company is named. A useful framework keeps four signals apart, because each describes a different position in a buyer decision.',
    },
    { type: 'subheading', text: 'Mentions' },
    {
      type: 'paragraph',
      text: 'A mention is any appearance of the brand in a generated answer. "Common options include Brand A, Brand B, and Brand C" mentions three companies. It is the broadest evidence of observed visibility, and it says nothing about whether the brand was recommended, compared, criticised, or referenced in passing.',
    },
    { type: 'subheading', text: 'Citations' },
    {
      type: 'paragraph',
      text: 'A citation is a visible link or source attribution to a specific page. A brand can be mentioned without its website being cited, and a page can be cited in an answer that is mostly about the category rather than the company. Tracking the two separately prevents the common reporting mistake of assuming every mention originates from owned content.',
    },
    { type: 'subheading', text: 'Recommendations' },
    {
      type: 'paragraph',
      text: 'Recommendations matter most for commercial questions. "Other companies in this category include Brand A" and "Brand A is worth considering if you need X" both contain the name, but they place the company differently in the decision. A recommendation label should stay inspectable against the answer that produced it.',
    },
    { type: 'subheading', text: 'Competitive positioning' },
    {
      type: 'paragraph',
      text: 'Generated answers usually name several companies together, which makes co-occurrence measurable: which brands appear most often, which competitors are recommended alongside you, which appear when you do not, and which own particular topics or buying stages. That turns an isolated brand metric into a benchmark.',
    },
    { type: 'heading', text: 'Use a four-part measurement taxonomy' },
    {
      type: 'paragraph',
      text: 'A referral visit, a Google generative-search impression, a Bing citation, and an observed response from a controlled prompt test are different events with different denominators and coverage models. Keep them separate before writing an executive summary.',
    },
    {
      type: 'table',
      headers: ['Evidence stream', 'What it measures', 'What it does not prove'],
      rows: [
        [
          'AI referral traffic in Analytics',
          'Visits that reached the site from recognised AI-assistant sources.',
          'How often an answer named the brand without producing a click.',
        ],
        [
          'Google generative-AI impressions',
          'Eligible appearances of links to the site in supported Google generative AI features.',
          'Visibility across every other answer engine.',
        ],
        [
          'Bing AI citation activity',
          'How often pages are cited across supported Microsoft AI experiences.',
          'A universal AI ranking or authority score.',
        ],
        [
          'Controlled prompt observations',
          'Mentions, recommendations, citations, and competitor presence across a defined prompt portfolio.',
          'Population-wide user behaviour or causal impact.',
        ],
      ],
    },
    {
      type: 'paragraph',
      text: 'A rise in AI referral traffic does not establish that the brand was mentioned more often. A rise in controlled prompt visibility does not establish that population-wide AI traffic increased. Reporting movement in one stream as though it were the other is the error this table exists to prevent.',
    },
    { type: 'heading', text: 'Read each native platform report within its scope' },
    { type: 'subheading', text: 'AI referral traffic in Google Analytics' },
    {
      type: 'richParagraph',
      content: [
        'Google Analytics provides an AI Assistant default channel for recognised traffic from assistants such as ChatGPT, Gemini, DeepSeek, Copilot, or Grok, and its documentation states that the channel excludes Google’s own AI Overviews and AI Mode traffic. Use that native classification before maintaining a custom source regex as the primary workflow. ',
        { type: 'citation', sourceId: 'ga-ai-assistant' },
      ],
    },
    {
      type: 'paragraph',
      text: 'This stream answers how many sessions arrived from recognised assistants, which pages received them, and how that engagement compares with other channels. It is a traffic measure, not a substitute for mention or citation monitoring: an answer can name or cite a company without generating a visit.',
    },
    { type: 'subheading', text: 'Google generative-AI impressions in Search Console' },
    {
      type: 'richParagraph',
      content: [
        'Search Console reports impressions for supported Google Search generative features, including AI Overviews and AI Mode, with breakdowns by page, country, date, and device. An impression means links to the site were shown in one of those features under Google’s own reporting rules, subject to the documented aggregation and availability limits. ',
        { type: 'citation', sourceId: 'gsc-ai-report' },
      ],
    },
    {
      type: 'paragraph',
      text: 'It is Google’s first-party evidence about Google surfaces. It says nothing about visibility inside ChatGPT, Claude, Perplexity, or any other product.',
    },
    { type: 'subheading', text: 'Bing AI citation activity' },
    {
      type: 'richParagraph',
      content: [
        'Bing Webmaster Tools reports AI Performance across supported Microsoft AI experiences, covering total citations, average cited pages, grounding queries, page-level citation activity, and trends over time. Bing states that average cited pages does not indicate ranking, authority, or the role of any page within an individual answer, and that page-level activity reflects how often pages are cited rather than page importance, ranking, or placement. ',
        { type: 'citation', sourceId: 'bing-ai-preview' },
        { type: 'citation', sourceId: 'bing-ai-performance' },
      ],
    },
    {
      type: 'callout',
      title: 'Observational, not causal',
      text: 'A change in reported citation activity is an observation. It cannot be attributed to one content edit, one model update, or one event without a design that rules out the alternatives, and no native report supplies that design.',
      tone: 'warning',
    },
    { type: 'heading', text: 'Run controlled prompt observations' },
    {
      type: 'paragraph',
      text: 'Native reports cannot compare brands, recommendations, and competitors across several engines. That requires a fixed portfolio of representative prompts, run repeatedly under recorded conditions.',
    },
    {
      type: 'checklist',
      title: 'Preserve for every observation',
      items: [
        {
          title: 'The prompt and the surface',
          description:
            'Original prompt text, the engine or surface tested, and the run conditions that could change the answer.',
        },
        {
          title: 'The answer itself',
          description:
            'The raw response, so any derived label can be read back against the text that produced it.',
        },
        {
          title: 'The derived observations',
          description:
            'Detected brand mentions, detected competitors, and visible citations or linked sources, each kept distinct.',
        },
        {
          title: 'The date and the outcome',
          description:
            'When the observation ran, and whether it completed, returned nothing, or failed.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'The denominator carries the meaning. A valid response with no mention is an observed zero. Failed and unavailable runs are reported separately rather than silently converted into misses or dropped from the dataset. Thirty carefully chosen buyer questions describe more than three hundred loose prompts assembled to manufacture appearances.',
    },
    { type: 'subheading', text: 'Build the portfolio from real buying behaviour' },
    {
      type: 'paragraph',
      text: 'The portfolio should represent the information environment in which customers discover and compare products, not the questions most likely to return your name.',
    },
    {
      type: 'checklist',
      items: [
        {
          title: 'Problem discovery',
          description: 'How can I solve this problem, and what tools help with it?',
        },
        {
          title: 'Category discovery',
          description:
            'What are the best platforms in this category, and which companies provide this service?',
        },
        {
          title: 'Comparison',
          description: 'Compare two named products, or ask for one versus the other directly.',
        },
        {
          title: 'Alternatives',
          description: 'Alternatives to a competitor, or products similar to one.',
        },
        {
          title: 'Decision stage',
          description:
            'Which option suits a specific segment, team size, region, or integration requirement.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'Preserve results by engine rather than flattening them into one universal ranking. Different products return different answers to the same question, and a company can have strong visibility in one engine, frequent citations in another, and weak buying-stage visibility everywhere.',
    },
    { type: 'heading', text: 'The core controlled metrics' },
    {
      type: 'table',
      caption: 'Every rate uses eligible completed observations as its denominator',
      headers: ['Metric', 'Definition', 'What it tells you'],
      rows: [
        [
          'Mention rate',
          'Eligible observations containing the brand, over total eligible completed observations.',
          'Whether the brand is present at all in the portfolio.',
        ],
        [
          'Citation rate',
          'Eligible observations citing the domain, over total eligible completed observations.',
          'Whether owned content is receiving visible attribution.',
        ],
        [
          'Recommendation rate',
          'Eligible observations presenting the brand as a relevant option, not merely naming it.',
          'How the brand is positioned on commercial questions.',
        ],
        [
          'Share of voice',
          'Brand presence compared with a fixed competitor set across the same prompts and rules.',
          'Where a competitor is visible and the brand is not.',
        ],
      ],
    },
    {
      type: 'paragraph',
      text: 'Share of voice is only meaningful when the comparison set is defined before collection. If you track fifty category prompts and appear in twenty-two eligible observations while one competitor appears in thirty-one and another in eighteen, that is a benchmark within that portfolio. Segment it by engine, topic, buyer stage, prompt group, or period to find where the difference comes from.',
    },
    { type: 'subheading', text: 'Citation source mix' },
    {
      type: 'paragraph',
      text: 'Which pages and source types earn citations is more actionable than the raw citation count. Group them into owned site, competitor sites, editorial and media, community sources, review platforms, documentation, marketplaces, and other third parties.',
    },
    {
      type: 'paragraph',
      text: 'Low owned-domain citation visibility alongside strong third-party coverage is a different problem from having almost no presence anywhere, and it calls for a different response.',
    },
    { type: 'subheading', text: 'Visibility trend' },
    {
      type: 'paragraph',
      text: 'Individual responses vary, so a single run is not a ranking. Trends are comparable only while the prompt portfolio, comparison set, and measurement rules stay stable. Watch for movement confined to one engine or one topic, which a blended score would hide.',
    },
    { type: 'subheading', text: 'How the brand is described' },
    {
      type: 'paragraph',
      text: 'Some platforms classify tone. That can be useful, but it does not replace reading the answer: a response can describe a company warmly while quoting an incorrect price, a removed feature, or a misleading comparison. For commercially important prompts, track both how the brand is described and whether the description is accurate.',
    },
    { type: 'heading', text: 'Build a reporting cadence' },
    {
      type: 'list',
      ordered: true,
      items: [
        'Freeze definitions: what counts as a mention, citation, recommendation, eligible observation, competitor, and failure.',
        'Record scope: the prompt portfolio, engines, properties, and comparison window.',
        'Report each evidence stream separately before merging anything into a summary.',
        'Show denominators, coverage, and failures next to every rate.',
        'Annotate content releases and technical changes without claiming they caused the movement.',
        'Compare repeated observations under stable methodology to describe direction and variance.',
      ],
    },
    { type: 'heading', text: 'From measurement to the next investigation' },
    {
      type: 'paragraph',
      text: 'The point of measuring is to find information gaps, not to accumulate dashboards. When the brand is absent from a group of high-intent prompts, the useful next question is what appeared instead: which competitors were named, which sources were cited, what those sources contained, and whether an equivalent page exists.',
    },
    {
      type: 'richParagraph',
      content: [
        'That source-level analysis is its own workflow. The guide to ',
        {
          type: 'link',
          text: 'tracking and optimising AI citations',
          href: '/blog/track-optimize-ai-citations',
        },
        ' covers how to read the sources winning a prompt and turn the evidence into a content backlog, and the ',
        {
          type: 'link',
          text: 'verification protocol',
          href: '/blog/verify-improve-ai-search-visibility',
        },
        ' covers how to observe the same portfolio again afterwards without overstating what changed.',
      ],
    },
    { type: 'heading', text: 'Choosing a platform to measure with' },
    {
      type: 'paragraph',
      text: 'Tools vary in what they actually measure, so start with the evidence rather than the headline score. A platform is worth evaluating if it can show which prompts mention the brand, which mention competitors instead, which engine produced each answer, which pages and domains were cited, and the original response behind any of it.',
    },
    {
      type: 'list',
      items: [
        'Are mentions, citations, and recommendations measured separately?',
        'Can competitors be tracked against the same prompt set and rules?',
        'Are denominators, failures, and unavailable runs visible next to the rates?',
        'Can results be segmented by engine, topic, and intent, and compared over time?',
        'Can the underlying observations be inspected and exported?',
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'On cost, compare tracked prompts, projects, competitors, engines, run frequency, citation evidence, and retention rather than dashboard feature counts. One structural difference matters more than the headline figure: whether model and provider usage is bundled into the subscription or billed against your own API keys. Plans and limits change, so price a decision from a current ',
        { type: 'link', text: 'pricing page', href: '/pricing' },
        ' rather than figures quoted in an article.',
      ],
    },
    { type: 'heading', text: 'A practical starting framework' },
    {
      type: 'paragraph',
      text: 'A first measurement system does not need hundreds of prompts. Twenty to thirty high-value questions, three to five competitors, the engines that matter to your audience, and a mix of discovery, comparison, alternative, and buying-stage intent is enough to establish a baseline you can defend.',
    },
    {
      type: 'list',
      ordered: true,
      items: [
        'How often are we mentioned, and in which eligible denominator?',
        'How often is our domain cited, as opposed to merely named?',
        'Where are competitors more visible under the same rules?',
        'Which sources are earning the citations we are not?',
        'Which topics or buyer stages contain our largest gaps?',
        'How do those observations move across comparable periods?',
      ],
    },
    {
      type: 'callout',
      title: 'Observed, not universal',
      text: 'Controlled prompt tracking describes a sampled portfolio under recorded conditions. It is not a census of what every user sees, and describing it as one is the fastest way to lose the trust the measurement was built to earn.',
      tone: 'info',
    },
    {
      type: 'richParagraph',
      content: [
        'CiteLadder keeps observed mentions, citations, recommendations, competitors, and sources connected to the answers that produced them, with unknown, failed, and observed-zero states distinct. Build the underlying evidence with the ',
        {
          type: 'link',
          text: 'owned-evidence guide',
          href: '/blog/connecting-owned-evidence-ai-search',
        },
        ', or see how the loop fits together on ',
        { type: 'link', text: 'CiteLadder solutions', href: '/solutions' },
        '.',
      ],
    },
  ],
};
