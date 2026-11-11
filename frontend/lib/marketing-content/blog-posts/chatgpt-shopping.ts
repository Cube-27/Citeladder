import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';
import { BLOG_SOURCES } from '../blog-sources';

export const POST_CHATGPT_SHOPPING: BlogPost = {
  slug: 'track-products-in-chatgpt-shopping',
  title: 'How to track your products in ChatGPT shopping answers',
  seoTitle: 'How to Track Your Products in ChatGPT Shopping Answers | CiteLadder',
  seoDescription:
    'What a ChatGPT shopping carousel card carries, why its price and merchant are sometimes missing, and how to measure product visibility, win rate, position and quoted price.',
  excerpt:
    'ChatGPT answers shopping questions with product carousels. Here is what each card carries, why fields go missing, and how CiteLadder turns cards and answer text into per-product metrics.',
  image: '/blog/editorial/article-citations.png',
  date: '2026-11-11',
  readTime: '9 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['ChatGPT Shopping', 'Product Visibility', 'Ecommerce'],
  relatedSlugs: ['ai-search-buyer-prompt-generation', 'how-to-optimize-content-for-ai-search'],
  sources: [BLOG_SOURCES.openaiProductDiscovery, BLOG_SOURCES.openaiCrawlers],
  closing: {
    secondary: { href: '/platform/product-visibility', label: 'Explore Product Visibility' },
    heading: 'See where your products rank in AI answers',
    body: 'Match your catalog in every tracked answer, read ChatGPT shopping carousels, and get an Action when a product goes unmentioned or is quoted at the wrong price.',
  },
  body: [
    {
      type: 'paragraph',
      text: 'To track your products in ChatGPT shopping answers, run the buying questions your customers ask, capture each answer’s product carousel as well as its text, and match every card and every named product to your catalog. Then count, per product, how often it appears, where it ranks, what price the answer quotes and which merchant it sends shoppers to. Read each figure with its denominator, and treat a missing price or merchant as missing, not as zero.',
    },
    {
      type: 'paragraph',
      text: 'This post explains what a carousel card carries, why its fields are sometimes empty, and how CiteLadder turns cards and answer text into product metrics. The card details come from two ChatGPT shopping answers we collected ourselves on 11 November 2026.',
    },
    {
      type: 'callout',
      title: 'How to read this post',
      text: 'The card findings describe two answers, collected in the US in English with web search on. They show what a card can carry, not how often each field is filled across ChatGPT. Product steps describe what CiteLadder does today.',
      tone: 'info',
    },
    { type: 'heading', text: 'What a ChatGPT shopping carousel is' },
    {
      type: 'paragraph',
      text: 'When a question is about buying something, ChatGPT can answer with a row of product cards alongside its text. The carousel is part of the answer: it decides which products a shopper sees first, often before they read a word of the reply. A tracker that only reads the text misses that order.',
    },
    {
      type: 'richParagraph',
      content: [
        'OpenAI says merchants can share product feeds with ChatGPT for discovery through its Agentic Commerce Protocol. ',
        { type: 'citation', sourceId: 'openai-product-discovery' },
        ' Whatever feeds the carousel, the result you can measure is the same: which products the answer shows, in what order, with what price and merchant.',
      ],
    },
    { type: 'heading', text: 'What a carousel card carries' },
    {
      type: 'paragraph',
      text: 'In both answers we collected, the carousel arrived as a block of product cards with its own position in the answer. Each card can carry these fields:',
    },
    {
      type: 'table',
      headers: ['Field', 'What it holds'],
      rows: [
        ['Title', 'The product name as ChatGPT shows it, sometimes with variant detail'],
        ['Tag', 'ChatGPT’s own label for the card, such as “Best overall value”'],
        ['Price and currency', 'A number and its currency'],
        ['Merchant', 'One merchant name'],
        ['URL and domain', 'The product link, carrying utm_source=chatgpt.com, and its domain'],
        ['Image', 'Product image links'],
        ['Product id', 'ChatGPT’s own key for the product'],
        ['Rating', 'A rating field, empty on every card we saw'],
      ],
      caption:
        'Fields on a ChatGPT shopping carousel card, from two answers collected on 11 November 2026.',
    },
    {
      type: 'paragraph',
      text: 'Two fields matter most for matching. The URL points at a page, which can be compared with your catalog once tracking parameters are removed. The product id is ChatGPT’s own key, so the same product can be recognized again in a later answer even when its title is worded differently.',
    },
    { type: 'heading', text: 'Why the fields you get vary' },
    {
      type: 'paragraph',
      text: 'Field fill was very different between our two answers. A running-shoes answer filled the price, currency, merchant, URL, domain and product id on all five of its cards. A whey-protein answer filled only the title and the tag on its four cards: no price, no merchant and no link.',
    },
    {
      type: 'paragraph',
      text: 'Two answers cannot tell you why one category is filled and another is not, and we do not claim a pattern. What they show is enough for measurement design: any field except the title can be absent, so every figure built on price or merchant needs an explicit empty state.',
    },
    {
      type: 'callout',
      title: 'Ratings were empty on every card',
      text: 'The rating field was null on all nine cards across both answers. That is why CiteLadder does not read card ratings: a metric that is always empty would only look like data.',
      tone: 'warning',
    },
    { type: 'heading', text: 'Sponsored cards are not recommendations' },
    {
      type: 'paragraph',
      text: 'ChatGPT can also show sponsored products. CiteLadder keeps them with its ads reporting: a sponsored card never holds a slot or a position on the shelf, so a paid placement cannot read as an organic recommendation, and an organic card’s position counts only the organic cards before it.',
    },
    { type: 'heading', text: 'How CiteLadder turns answers into product metrics' },
    {
      type: 'diagram',
      title: 'From catalog to product Actions',
      variant: 'flow',
      data: {
        steps: [
          {
            step: '01',
            title: 'Catalog',
            desc: 'Import a Shopify storefront, a Merchant Center feed or a CSV, or use products found on your site.',
          },
          {
            step: '02',
            title: 'Prompts',
            desc: 'Approve shopping prompts per category and for hero products.',
          },
          {
            step: '03',
            title: 'Collect',
            desc: 'Run audits across your engines, with repetitions.',
          },
          {
            step: '04',
            title: 'Match',
            desc: 'Match carousel cards and answer text to your products and approved competitors.',
          },
          {
            step: '05',
            title: 'Measure',
            desc: 'Read visibility, win rate, position, price and merchants per product.',
          },
          {
            step: '06',
            title: 'Act',
            desc: 'Work through Actions for missing, mispriced or outranked products.',
          },
        ],
      },
    },
    { type: 'subheading', text: 'Matching a card to your product' },
    {
      type: 'paragraph',
      text: 'Each organic card becomes one ranked slot, at its position among the organic cards. CiteLadder matches it to a product in three steps, in order: by its link to a product or approved competitor page, tracking parameters ignored; then by a ChatGPT product id an earlier card in your project was matched to; then by name over the card title. Matching is deterministic, and cards are never sent to a model. In a shopping audit, a card that matches nothing and links off your own site is kept as an AI-observed competitor for you to review.',
    },
    {
      type: 'paragraph',
      text: 'CiteLadder reads carousels from ChatGPT only. On every engine it also reads the answer text: an ordered list gives each item a rank, and a product named in a sentence counts as unranked. When an answer has both a carousel and a list, the carousel sets the order.',
    },
    { type: 'subheading', text: 'Every answer, and the last 30 days' },
    {
      type: 'paragraph',
      text: 'Products are matched in every successful answer the project collects, not only in shopping audits, so a brand prompt that happens to recommend a product counts. When you import or change the catalog, CiteLadder re-reads the stored answers from the last 30 days against the new catalog. A product added today is measured against answers you already have, and the original answers are never rewritten.',
    },
    { type: 'subheading', text: 'The metrics, per product' },
    {
      type: 'table',
      headers: ['Metric', 'Definition', 'When there is no data'],
      rows: [
        ['Visibility', 'Answers where the product holds a slot ÷ answers in scope', 'Unavailable'],
        ['Appearances', 'Answers where the product holds a slot', 'Zero is a real zero'],
        ['Win rate', 'Ranked appearances at first place ÷ ranked appearances', 'Unavailable'],
        ['Position', 'Average best rank over ranked appearances', 'Unavailable'],
        [
          'Mentioned price',
          'Median quoted price in your catalog currency; other currencies counted, not converted',
          'Unavailable',
        ],
        ['Catalog price', 'Your price, or the range across variants', 'Unknown'],
        ['Merchants', 'Merchant domains the answers name, by answers', 'Empty list'],
      ],
      caption:
        'A product holds at most one slot per answer, at its best rank. Scope is the window you choose, 7, 30 or 90 days, and optionally one engine or prompt set.',
    },
    { type: 'heading', text: 'Why win rate depends on appearing' },
    {
      type: 'paragraph',
      text: 'Win rate is conditional: it only counts answers that rank the product. A product that appears in a handful of answers can still come first in most of them, so a high win rate beside a low visibility means “rarely shown, strong when shown”, not “winning the category”. The fix for that product is to get into more answers, not to improve its rank.',
    },
    {
      type: 'paragraph',
      text: 'The opposite case is a product that appears often but rarely first. Its visibility looks healthy, and the win rate shows that answers prefer something else. Read the two together, and open the product’s competing products to see who takes first place in the answers it shares.',
    },
    { type: 'heading', text: 'Which prompts to track for products' },
    {
      type: 'richParagraph',
      content: [
        'Shopping prompts in CiteLadder are planned per category, not per product. For each category, a matrix crosses buyer contexts with intent stages, three contexts at the consideration and decision stages by default, and writes one prompt per cell that names no brand. A few branded comparisons are added, at most a fifth of the batch, and kept out of product metrics because they name you by design. Per-product prompts exist only for the hero products you pick. ',
        {
          type: 'link',
          text: 'How CiteLadder builds a prompt portfolio',
          href: '/blog/ai-search-buyer-prompt-generation',
        },
        ' covers the approval step every prompt goes through.',
      ],
    },
    { type: 'heading', text: 'What to do with the findings' },
    {
      type: 'checklist',
      title: 'Product Actions CiteLadder raises',
      items: [
        {
          title: 'Not mentioned',
          description:
            'The product has no appearance in the window’s answers. Check the product page’s crawl access and content before anything else.',
        },
        {
          title: 'Price mismatch',
          description:
            'The median price answers quote differs from your catalog price by more than a set share. Check the price in your structured data, feeds and merchant listings.',
        },
        {
          title: 'Losing position',
          description:
            'The product is ranked but rarely first. Compare it with the products that take first place in the same answers.',
        },
        {
          title: 'Merchant absent',
          description: 'Answers name merchants for the product, and none of them is your own site.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'Each rule waits for a minimum number of answers before it raises anything, so one odd answer does not become an Action. Once you mark an Action implemented, later answers are read against the same metric.',
    },
    {
      type: 'richParagraph',
      content: [
        'Start with access. OpenAI documents that ChatGPT search surfaces websites through its OAI-SearchBot crawler, and sites that block it are not shown in ChatGPT search answers. ',
        { type: 'citation', sourceId: 'openai-crawlers' },
        ' For the page itself, the ',
        {
          type: 'link',
          text: 'guide to optimizing content for AI search',
          href: '/blog/how-to-optimize-content-for-ai-search',
        },
        ' covers what makes a page easy to retrieve and quote.',
      ],
    },
    { type: 'heading', text: 'What this does not measure' },
    {
      type: 'list',
      items: [
        'Product ratings, because the cards we tested carried none.',
        'Shopping carousels on Google’s AI surfaces. Carousels are read from ChatGPT; other engines are read from the answer text.',
        'Sales, orders or revenue. For visits from AI assistants, use GA4 referral data.',
        'Change over time. Figures cover the window you choose, without previous-period comparisons or charts.',
        'A live connection to Shopify or Merchant Center. Imports are files or a public storefront URL, run again when your catalog changes.',
      ],
    },
    { type: 'heading', text: 'Frequently asked questions' },
    { type: 'subheading', text: 'Can I see which products ChatGPT recommends for my category?' },
    {
      type: 'paragraph',
      text: 'Yes, for the prompts you track. The products ChatGPT names or shows in a carousel are matched against your catalog and approved competitors. In shopping audits, products that match neither and link off your site are listed as AI-observed competitors for you to review.',
    },
    { type: 'subheading', text: 'Why is the price missing for some of my products?' },
    {
      type: 'paragraph',
      text: 'Because the answer did not quote one. Carousel cards do not always carry a price, and answer text often names a product without one. A product with no quoted price reads as unavailable, not zero.',
    },
    { type: 'subheading', text: 'Do sponsored products count?' },
    {
      type: 'paragraph',
      text: 'No. Sponsored cards are kept with ads reporting and never hold a shelf slot or a position.',
    },
    { type: 'subheading', text: 'Do I need a Shopify app?' },
    {
      type: 'paragraph',
      text: 'No. CiteLadder imports a public Shopify storefront by its URL, a Merchant Center feed file or a CSV, and can use products found on your site. There is no app to install.',
    },
    {
      type: 'richParagraph',
      content: [
        'See the metrics and screens on ',
        { type: 'link', text: 'Product Visibility', href: '/platform/product-visibility' },
        ', and read the ',
        {
          type: 'link',
          text: 'Commerce documentation',
          href: 'https://docs.citeladder.com/commerce/',
        },
        ' for catalog import fields and metric definitions.',
      ],
    },
  ],
};
