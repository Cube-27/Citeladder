import { type PlatformPage } from './platform-page-types';

/** Diagnosis capabilities: site, first-party search and external research. */
export const DIAGNOSE_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/site-health',
    title: 'AEO Website Audit & Technical SEO Checks | CiteLadder',
    description:
      'Crawl your site for technical SEO, answer-readiness and AI crawler access issues, with page-level evidence for every finding and a recrawl to verify fixes.',
    heading: 'Find the site issues that keep you out of answers.',
    lead: 'Crawl your site and get page-level findings with the evidence attached. Checks cover indexing, structure, structured data, answer-readiness and which AI crawlers your robots.txt lets in.',
    cta: 'demo',
    visual: 'site-health',
    visualTitle: 'Site Health',
    highlights: [
      {
        title: 'Page-level evidence',
        body: 'Each finding shows the page, what was captured and why it matters for that type of page.',
      },
      {
        title: 'AI crawler access',
        body: 'robots.txt permissions by crawler purpose: search, AI search, training and user-triggered fetches.',
      },
      {
        title: 'Coverage beside every score',
        body: 'Scores come with what was checked, so a partial crawl never reads as a full audit.',
      },
    ],
    features: [
      {
        title: 'Two scores, each with a clear meaning.',
        body: 'Web Fundamentals covers the basics every page needs: indexability, HTTPS, titles, canonicals, language, mobile viewport and more. AEO Readiness scores what answer engines rely on across seven pillars. Only checks that matter for visibility or performance count toward a score; the rest stay visible as advice.',
        points: [
          'Crawlability, machine readability, structure and answerability',
          'Evidence, provenance and freshness',
          'Each page classified, so only relevant checks apply',
          'Advisory and diagnostic checks shown without scoring',
        ],
        visual: 'pillars',
      },
      {
        title: 'Technical and answer-readiness checks together.',
        body: 'Review website fundamentals alongside the structure, evidence and machine readability that answer engines rely on. Server-rendered content, valid structured data that matches the page, and clear headings are checked page by page. Unresolved checks stay visible instead of passing silently.',
        points: [
          'Grouped issues with every affected page',
          'Structured data validated against visible content',
          'Broken internal links, sitemap and hreflang defects',
          'Internal links: inbound links, depth from home and anchor text',
        ],
        visual: 'page-evidence',
      },
      {
        title: 'Know which AI crawlers you let in.',
        body: 'Site Health reads your robots.txt and reports access for each known crawler by purpose. Blocking a search crawler such as OAI-SearchBot or Claude-SearchBot is scored, because it can keep you out of answers. Blocking training crawlers is your choice, so it is shown without a penalty.',
        points: [
          'Search, AI search, training and user-fetch crawlers kept apart',
          'robots.txt history across crawls',
          'llms.txt reported as a diagnostic, not scored',
        ],
        visual: 'site-health',
      },
      {
        title: 'From a finding to a verified fix.',
        body: 'Hand any issue to the Agent to prepare a bounded developer brief. Your team implements it, marks it done, and a later crawl checks the result against the same evidence.',
        points: [
          'Ask the Agent from any issue group',
          'Briefs cite the captured evidence',
          'Recrawl to verify the change',
          'CSV and Markdown exports for your developers',
        ],
        visual: 'agent',
      },
    ],
    steps: [
      {
        title: 'Crawl',
        body: 'CiteLadder samples your site within your plan’s page allowance, respecting robots.txt.',
      },
      {
        title: 'Classify',
        body: 'Each page is classified by kind, so a product page and a blog post get the checks that fit.',
      },
      {
        title: 'Review',
        body: 'Read grouped issues, scores and coverage, and open any page for the captured evidence.',
      },
      {
        title: 'Fix and recrawl',
        body: 'Brief the fix, ship it, and confirm it in the next crawl.',
      },
    ],
    questions: [
      'Is anything blocking our key pages from being indexed or cited?',
      'Do our robots.txt rules keep out the AI search crawlers we want in?',
      'Does our structured data match what the page actually says?',
      'Which page types score worst for answer-readiness, and why?',
      'Did last sprint’s fixes actually land?',
    ],
    faqs: [
      {
        q: 'What does Site Health check?',
        a: 'Technical fundamentals such as indexability, HTTPS, canonicals and titles; answer-readiness across crawlability, machine readability, structure, answerability, evidence, provenance and freshness; structured data; internal links; and robots.txt access for known crawlers.',
      },
      {
        q: 'How is it different from a standard SEO audit?',
        a: 'It adds answer-readiness checks and AI crawler access to the technical basics, classifies each page before checking it, and ties every finding to captured evidence that the Agent can use to write a fix brief.',
      },
      {
        q: 'Does a higher score guarantee AI citations?',
        a: 'No. It summarizes the checks that applied to your pages. Engines decide what to index and cite on their own.',
      },
      {
        q: 'How many pages are crawled?',
        a: 'Up to your plan’s monitored page allowance. Pages are sampled across your site in a reproducible way, and the coverage figure tells you how much was checked.',
      },
      {
        q: 'Is robots permission the same as crawler traffic?',
        a: 'No. Site Health reads your policy. Allowing a crawler is not evidence that it visited. AI crawler logs show the requests that actually arrived.',
      },
      {
        q: 'Does Site Health check llms.txt?',
        a: 'Yes, as a diagnostic. It is reported with your crawl, but it does not affect your score.',
      },
      {
        q: 'Does it measure Core Web Vitals?',
        a: 'No. Site Health reports server response time as a diagnostic, but it does not produce field Core Web Vitals.',
      },
    ],
    closing: 'Give your developers a clear starting point.',
    related: [
      '/platform/content-intelligence',
      '/platform/demand-intelligence',
      '/platform/agents',
      '/platform/ai-visibility',
    ],
  },
  {
    path: '/platform/demand-intelligence',
    title: 'Search Demand & GSC Opportunity Analysis | CiteLadder',
    description:
      'Turn Search Console queries and landing pages into ranked opportunities: striking-distance queries, CTR gaps, cannibalization, relevance gaps and demand shifts.',
    heading: 'Find the opportunities already in your search data.',
    lead: 'Connect Search Console to see which queries reach which pages, and get the signals worth acting on instead of another unranked keyword list.',
    cta: 'demo',
    visual: 'demand',
    visualTitle: 'Search Demand',
    highlights: [
      {
        title: 'Striking distance',
        body: 'Queries ranking just off page one, tied to the page that ranks for them.',
      },
      {
        title: 'CTR gaps',
        body: "Pages earning fewer clicks than your property's norm for their position.",
      },
      {
        title: 'Demand shifts',
        body: 'Emerging and declining queries between periods, with branded demand kept separate.',
      },
    ],
    features: [
      {
        title: 'Signals, not another keyword list.',
        body: 'Demand Intelligence reads your Search Console queries and pages and raises the specific patterns worth acting on. Each signal names the page and query involved and the reporting window it came from.',
        points: [
          'High impressions with low click-through',
          'Striking-distance queries and CTR gaps against your own norm',
          'Two pages competing for the same query',
          'Emerging and declining queries, with branded demand apart',
        ],
        visual: 'demand',
      },
      {
        title: 'Queries in their landing-page context.',
        body: 'See what each page appears for before you decide how to change it. Where the page can be read, its title, H1 and content are compared with the queries it wins, so a mismatch between search intent and page copy is easy to spot.',
        points: [
          'Grouped by page or by query',
          'Reporting window and source on every row',
          'Query-to-page relevance checks',
          'Unknown and ambiguous states kept visible',
        ],
        visual: 'query-page',
      },
      {
        title: 'From a signal to a reviewable edit.',
        body: 'Signals become page Actions beside your Site Health and visibility findings. Open the evidence behind any Action and hand it to the Agent to draft a focused change. Later data shows what happened next.',
        points: [
          'Signals become page Actions',
          'The handoff includes the evidence',
          'Changes measured against the earlier window',
        ],
        visual: 'actions',
      },
    ],
    steps: [
      {
        title: 'Connect Search Console',
        body: 'Sign in with Google and map the Search Console property for your site.',
      },
      {
        title: 'Import queries and pages',
        body: 'CiteLadder imports query and page data and checks coverage for each reporting window.',
      },
      {
        title: 'Review signals',
        body: 'Read the ranked signals by page or by query, with the evidence behind each.',
      },
      {
        title: 'Act and compare',
        body: 'Send a page Action to the Agent, ship the change, and compare the next window.',
      },
    ],
    questions: [
      'Which queries are one push away from page one?',
      'Which pages get impressions but not clicks?',
      'Are two of our pages competing for the same query?',
      'Which queries are rising or falling, outside our brand name?',
      'Does the page that ranks actually answer the query?',
    ],
    faqs: [
      {
        q: 'Which signals does Demand Intelligence find?',
        a: 'High impressions with low click-through, striking-distance queries, click-through gaps against your property’s norm, two pages competing for one query, weak query-to-page relevance, emerging and declining queries, and branded query performance.',
      },
      {
        q: 'Is this data from private AI conversations?',
        a: 'No. Demand Intelligence uses your connected Search Console data. Suggested prompts are suggestions, not AI search volumes.',
      },
      {
        q: 'How is this different from Search Intelligence?',
        a: 'Demand uses your own first-party data. Search Intelligence adds external keyword, competitor and backlink research when you need it.',
      },
      {
        q: 'Why is branded demand kept separate?',
        a: 'Searches for your own name behave differently from category searches. Keeping them apart stops a brand campaign from hiding a decline in discovery queries.',
      },
      {
        q: 'Can I use Bing data too?',
        a: 'Yes. Bing Webmaster Tools connects with its own Microsoft sign-in, and its query and page data appears in Performance beside Search Console.',
      },
      {
        q: 'Does a signal prove a change will work?',
        a: 'No. A signal shows where your data suggests an opportunity. CiteLadder compares later windows after a change so you can judge the result.',
      },
    ],
    closing: 'Use the search data you already have to choose better work.',
    related: [
      '/platform/search-intelligence',
      '/platform/site-health',
      '/platform/content-intelligence',
      '/platform/integrations',
    ],
  },
  {
    path: '/platform/search-intelligence',
    title: 'Keyword, Competitor & Backlink Research | CiteLadder',
    description:
      'Research keywords, competing domains, top pages and backlinks with optional DataForSEO datasets, priced and confirmed before collection.',
    heading: 'Keyword and backlink research beside your AI evidence.',
    lead: 'Add external research when your own data cannot answer the question: ranked keywords, competitors, top pages and backlinks. Each collection shows its scope and price before you confirm it.',
    cta: 'setup',
    visual: 'search',
    visualTitle: 'Search Intelligence',
    highlights: [
      {
        title: 'Keywords and competitors',
        body: 'Ranked keywords, shared and missing keywords, and top pages for your domain and the rivals you choose.',
      },
      {
        title: 'Backlinks and overlap',
        body: 'Referring domains, linked pages and link history, matched to cited sources where the data allows.',
      },
      {
        title: 'No surprise spend',
        body: 'Every new collection shows its scope and maximum cost, and runs only after you confirm.',
      },
    ],
    features: [
      {
        title: 'Review the scope and cost first.',
        body: 'New research uses a review-and-confirm step: you see the target, market, row limit and maximum cost before anything is bought. Opening a saved dataset never buys a refresh, and missing results are never rewritten as zero.',
        points: [
          'Target, market and row limit up front',
          'Maximum cost before you confirm',
          'Saved datasets reopen for free',
          'CSV export of saved datasets',
        ],
        visual: 'acquisition',
      },
      {
        title: 'See where competitors win and you do not.',
        body: 'Compare ranking keywords across your domain and competitors to find the keywords they rank for that you miss. Strong gaps become keyword Actions beside your other evidence, so research turns into planned pages instead of a spreadsheet.',
        points: [
          'Ranking, shared and missing keywords',
          'Keyword suggestions around a seed',
          'Keyword-gap Actions with a bounded number per refresh',
        ],
        visual: 'search',
      },
    ],
    steps: [
      {
        title: 'Connect DataForSEO',
        body: 'Add your DataForSEO account in Integrations. CiteLadder never buys data without it.',
      },
      {
        title: 'Choose a dataset',
        body: 'Pick keywords, competitors, top pages or backlinks, and set the target and market.',
      },
      {
        title: 'Confirm the cost',
        body: 'Review the scope and maximum cost, then confirm the collection.',
      },
      {
        title: 'Use the results',
        body: 'Read saved datasets beside your AI evidence and act on keyword-gap Actions.',
      },
    ],
    questions: [
      'Which keywords do our competitors rank for that we do not?',
      'Which competitor pages earn the most organic traffic?',
      'Which domains link to the sources AI answers cite?',
      'How has our backlink profile changed over time?',
    ],
    faqs: [
      {
        q: 'Is Search Intelligence in the free trial?',
        a: 'No. It needs your own DataForSEO connection and a confirmation for each collection. Contact us to discuss your use case.',
      },
      {
        q: 'Which datasets are available?',
        a: 'Domain footprint, ranking keywords, missing and shared keywords, keyword suggestions, organic pages, backlink summary, referring domains, linked pages, individual backlinks and backlink history.',
      },
      {
        q: 'Who pays for the data?',
        a: 'Collections run on your own DataForSEO account. CiteLadder shows the maximum cost before you confirm, and reopening a saved dataset costs nothing.',
      },
      {
        q: 'Are search volumes the number of people asking AI?',
        a: 'No. They are external search estimates with their own definitions, not a count of AI conversations.',
      },
      {
        q: 'What is a keyword-gap Action?',
        a: 'A keyword with meaningful search volume where a competitor ranks in the top ten and you do not. A limited number are raised per refresh, so the list stays workable.',
      },
    ],
    closing: 'Research the questions your own data cannot answer.',
    related: [
      '/platform/demand-intelligence',
      '/platform/citation-intelligence',
      '/platform/content-intelligence',
      '/platform/integrations',
    ],
  },
];
