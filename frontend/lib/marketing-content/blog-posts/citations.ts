import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';

export const POST_CITATIONS: BlogPost = {
  slug: 'track-optimize-ai-citations',
  title: "How to Track and Optimize Your Brand's AI Citations",
  seoTitle: 'How to Track and Optimize AI Citations',
  seoDescription:
    'Track AI citations across answer engines, read the sources winning each prompt, diagnose citation gaps, and turn the evidence into a content backlog.',
  excerpt:
    'A mention tells you the brand was named. A citation tells you which page earned the attribution — and which competitor or third-party source earned it instead.',
  image: '/blog/editorial/article-citations.png',
  cardImage: '/blog/editorial/article-citations.svg',
  date: '2026-09-16',
  readTime: '9 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['AI Citations', 'Source Evidence', 'Content Gaps'],
  relatedSlugs: [
    'tracking-brand-visibility-ai-search',
    'auditing-content-for-llms-ai-search',
    'action-playbook-winning-ai-citations',
  ],
  sources: [
    {
      id: 'google-ai-mode-fanout',
      title: 'Google Search: Introducing AI Mode in India',
      publisher: 'Google (The Keyword)',
      url: 'https://blog.google/intl/en-in/products/google-search-introducing-ai-mode-in-india/',
    },
    {
      id: 'bing-ai-preview',
      title: 'Introducing AI Performance in Bing Webmaster Tools',
      publisher: 'Bing Webmaster Blog',
      url: 'https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview',
    },
    {
      id: 'gsc-ai-report',
      title: 'Generative AI performance report (Search)',
      publisher: 'Google Search Console Help',
      url: 'https://support.google.com/webmasters/answer/16984139?hl=en',
    },
  ],
  body: [
    {
      type: 'paragraph',
      text: 'A generated answer can name your company and cite somebody else. That gap is the whole subject of citation tracking: not whether an AI system has heard of you, but which pages and domains are supplying the evidence behind the answers your buyers read.',
    },
    {
      type: 'richParagraph',
      content: [
        'This guide covers the source-level half of the work. For the metric definitions, denominators, and native platform reports that establish a baseline, start with ',
        {
          type: 'link',
          text: 'how to measure brand presence in AI search',
          href: '/blog/tracking-brand-visibility-ai-search',
        },
        '.',
      ],
    },
    { type: 'heading', text: 'What counts as an AI citation' },
    {
      type: 'paragraph',
      text: 'A citation is a visible link or source attribution to a specific page inside a generated answer. A mention is the brand name appearing anywhere in the same answer. They are separate observations, and they move independently.',
    },
    {
      type: 'diagram',
      title: 'One answer, three kinds of source',
      variant: 'split',
      data: {
        leftTitle: 'Mention without citation',
        leftBadge: 'Common',
        leftItems: [
          'The answer names the brand in a list of options.',
          'The supporting links point at review sites, forums, or press.',
          'No page from the owned domain is visibly attributed.',
          'Improving owned content may change nothing on its own.',
        ],
        rightTitle: 'Citation of the owned domain',
        rightBadge: 'Actionable',
        rightItems: [
          'A specific owned URL is linked or attributed.',
          'The cited passage can be read back against the page.',
          'The page can be corrected, expanded, or clarified.',
          'The next observation can be compared against the same prompt.',
        ],
      },
    },
    {
      type: 'paragraph',
      text: 'Keeping the two apart prevents the most expensive reporting error in this field: reading a healthy mention rate as evidence that owned content is doing the work, when the answer is actually being assembled from sources you do not control.',
    },
    { type: 'heading', text: 'Why citations need their own view' },
    {
      type: 'paragraph',
      text: 'Traditional search tools report rankings, impressions, clicks, and keywords for pages. A citation is attached to an answer, not to a position, and the answer may be assembled from several sources at once. A company can rank well in conventional search and still be absent from the sources behind the questions its buyers actually ask.',
    },
    {
      type: 'richParagraph',
      content: [
        'Two native reports show part of this from the platform side. Search Console reports impressions for links to your site in supported Google generative features. ',
        { type: 'citation', sourceId: 'gsc-ai-report' },
        ' Bing Webmaster Tools reports citation counts and the grounding queries associated with cited pages, which connects a cited URL to the internal query that retrieved it. ',
        { type: 'citation', sourceId: 'bing-ai-preview' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Both are first-party evidence about their own surfaces only. Neither tells you which competitor was cited instead of you inside a different engine, which is why controlled prompt observations remain the comparison layer.',
    },
    { type: 'heading', text: 'Monitor citations with a repeatable prompt set' },
    {
      type: 'paragraph',
      text: 'Checking one prompt once establishes nothing. Answers vary with the prompt, engine, model, available web results, locale, and product changes, so citation tracking means running a stable set of buyer questions on a consistent schedule and keeping every response.',
    },
    { type: 'subheading', text: 'Start from questions buyers actually ask' },
    {
      type: 'paragraph',
      text: 'The prompt set determines what the citation evidence can tell you. Questions written to force the brand into the answer produce citations you cannot act on. A portfolio spanning informational, comparison, alternative, and decision-stage intent shows where source authority sits at each stage — and a brand often performs very differently across them.',
    },
    { type: 'subheading', text: 'Validate the reference before trusting the count' },
    {
      type: 'paragraph',
      text: 'Raw counts create false confidence. A brand name can overlap with a product, a person, a place, an abbreviation, or an ordinary word, and simple text matching will count all of it. Each appearance should be resolvable against the surrounding answer.',
    },
    {
      type: 'list',
      items: [
        'Is this actually our company, or a name collision?',
        'Is it a recommendation, a neutral reference, a comparison, or a criticism?',
        'Which competitors appear alongside it?',
        'Is our own domain cited, or is a third party supplying the evidence?',
        'Which exact page or source received the attribution?',
      ],
    },
    {
      type: 'callout',
      title: 'The answer is the evidence',
      text: 'Every derived label — mention, citation, recommendation, competitor — should lead back to the saved response and the conditions it ran under. A label that cannot be inspected cannot be audited, and it cannot be argued with when a stakeholder disagrees.',
      tone: 'info',
    },
    { type: 'heading', text: 'Read the sources that win the answer' },
    {
      type: 'paragraph',
      text: 'When a competitor is cited and you are not, inspect the cited page before deciding what to do. The reflex answer — write something longer — is usually wrong, because the cited source often wins on directness, completeness, or independence rather than length.',
    },
    {
      type: 'checklist',
      title: 'Questions to ask of a winning source',
      items: [
        {
          title: 'What does it answer better?',
          description:
            'Whether the page states a direct answer near the relevant heading rather than burying it in narrative.',
        },
        {
          title: 'Is it more complete or more current?',
          description:
            'Whether it covers subtopics your page omits, or carries a date and scope your page leaves implicit.',
        },
        {
          title: 'Does it carry original evidence?',
          description:
            'First-party data, documented product facts, pricing, limits, or research the rest of the category repeats.',
        },
        {
          title: 'Who published it?',
          description:
            'An owned competitor page, an independent publication, a review platform, documentation, a marketplace, or a community thread.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'That last question changes the response more than any other. Visibility in AI answers is not purely an owned-content problem: it is shaped by your own pages and by the wider body of information published about your brand and category.',
    },
    { type: 'heading', text: 'Diagnose the gap the citation evidence shows' },
    {
      type: 'paragraph',
      text: 'A citation gap exists when competing or third-party sources repeatedly earn attribution on questions where your company should reasonably be relevant. The evidence usually points at one of three problems, and they call for different work.',
    },
    { type: 'subheading', text: 'Gap 1: the topic is not covered' },
    {
      type: 'paragraph',
      text: 'Sometimes the reason is plain — there is no strong page answering the question. If buyers repeatedly ask about a comparison, use case, integration, or limitation your site barely addresses, there is little first-party material available to retrieve in the first place.',
    },
    { type: 'subheading', text: 'Gap 2: the page covers the topic too narrowly' },
    {
      type: 'richParagraph',
      content: [
        'A single customer question can represent several related information needs. Google documents that AI Mode uses a query fan-out technique that "breaks your question into subtopics and issues a multitude of queries simultaneously." ',
        { type: 'citation', sourceId: 'google-ai-mode-fanout' },
        ' That is Google describing one of its own products, not a universal mechanism every answer engine shares. It still makes the practical point: answering only the literal headline question can leave the supporting intents uncovered.',
      ],
    },
    {
      type: 'paragraph',
      text: 'Behind "what is the best AI visibility platform for ecommerce" sit product-page visibility, competitor share of voice, citation monitoring for retail brands, reporting across engines, and content-gap identification. A page that genuinely addresses those connected questions offers more retrievable material than one that repeats the primary keyword.',
    },
    { type: 'subheading', text: 'Gap 3: third-party sources own the answer' },
    {
      type: 'paragraph',
      text: 'When the cited sources are consistently review platforms, editorial coverage, community threads, or marketplaces, no amount of work on your own pages addresses the gap directly. The evidence shaping those answers lives somewhere you do not publish, and the response is a distribution or accuracy problem rather than a content-production one.',
    },
    { type: 'heading', text: 'Turn citation evidence into a content backlog' },
    {
      type: 'paragraph',
      text: 'Citation tracking earns its cost when it changes what a team investigates and publishes. Suppose competitors are cited across ten high-intent prompts where the brand is missing. Ten unrelated articles is the wrong response. Reading the answers and cited sources often shows that six of those prompts circle the same underlying topic.',
    },
    {
      type: 'list',
      ordered: true,
      items: [
        'Group the missing prompts by the underlying question, not by keyword.',
        'Inspect the cited sources for each group and record what they provide that you do not.',
        'Name the specific gap: absent topic, narrow coverage, stale facts, weak evidence, or third-party ownership.',
        'Choose the smallest change that closes it, and write down the evidence behind that choice.',
        'Record the changed passages, the exact URL, and when the change went live.',
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Deciding which owned page is weakest belongs to a page-level review — the ',
        {
          type: 'link',
          text: 'content audit guide',
          href: '/blog/auditing-content-for-llms-ai-search',
        },
        ' covers access, extractability, evidence, and structure. Making the change itself belongs to the ',
        {
          type: 'link',
          text: 'AEO action playbook',
          href: '/blog/action-playbook-winning-ai-citations',
        },
        '.',
      ],
    },
    { type: 'heading', text: 'Then observe the same prompts again' },
    {
      type: 'paragraph',
      text: 'After publishing, keep observing the original prompt set under the same recorded conditions. If citation activity changes, record the movement as an observation. A content edit and a change in an answer that occur near each other are associated, not causally linked, unless the design controlled for the alternatives — and ordinary content work rarely does.',
    },
    {
      type: 'richParagraph',
      content: [
        'The ',
        {
          type: 'link',
          text: 'verification protocol',
          href: '/blog/verify-improve-ai-search-visibility',
        },
        ' sets out the baseline, controls, comparison windows, and labels that keep a re-measurement honest.',
      ],
    },
    {
      type: 'callout',
      title: 'What citation tracking cannot tell you',
      text: 'It cannot prove why a source was chosen, that a crawler visit produced a citation, or that your edit caused the next answer. It tells you which sources were visibly attributed, under which prompts, on which engines, and how that changed.',
      tone: 'warning',
    },
    {
      type: 'richParagraph',
      content: [
        'CiteLadder keeps citations, cited URLs, mentions, recommendations, and competitor presence as distinct observations tied to the answers that produced them, so a gap can be traced to the source that filled it. See how the loop fits together on ',
        { type: 'link', text: 'CiteLadder solutions', href: '/solutions' },
        '.',
      ],
    },
  ],
};
