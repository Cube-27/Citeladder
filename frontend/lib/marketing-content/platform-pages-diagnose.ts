import { type PlatformPage } from './platform-page-types';

export const DIAGNOSE_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/site-health',
    updated: '2026-11-18',
    title: 'AEO Website Audit & Technical SEO Checks | CiteLadder',
    description:
      'Crawl your site for technical SEO, answer-readiness and AI crawler access issues, with page-level evidence for every finding and a recrawl to verify fixes.',
    heading: 'Find the site issues that keep you out of answers',
    lead: 'Find the problems on your site that stop AI from reading and recommending your pages.',
    cta: 'demo',
    screen: 'site-health',
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
        body: 'Each score shows how much of your site it covers, so you can see when a crawl was partial.',
      },
    ],
    features: [
      {
        title: 'Two scores: Web Fundamentals and AEO Readiness',
        body: 'Web Fundamentals covers the basics every page needs, such as indexability, HTTPS, titles, canonicals, language and the mobile viewport. AEO Readiness scores what answer engines rely on across seven pillars. Every check counts toward a score with a High, Medium or Low severity. A check that could not run is marked not checked and never raises a score.',
        points: [
          'Crawlability, machine readability, structure and answerability',
          'Evidence, provenance and freshness',
          'Each page classified, so only relevant checks apply',
          'Every check scored, with a severity',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Technical and answer-readiness checks together',
        body: 'CiteLadder checks each page for server-rendered content, structured data that is valid and matches what the page says, and clear headings. A check that could not run is marked unresolved, so you know what was not tested.',
        points: [
          'Grouped issues with every affected page',
          'Structured data validated against visible content',
          'Broken internal links, sitemap and hreflang defects',
          'Site-wide duplicate titles, missing H1s, dead-end pages and HTTP that never redirects to HTTPS',
          'Internal links: inbound links, depth from home and anchor text',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Know which AI crawlers you let in',
        body: 'Site Health reads your robots.txt and reports access for each known crawler by purpose. Blocking a search crawler such as OAI-SearchBot or Claude-SearchBot is scored, because it can keep you out of answers. Blocking training crawlers is your choice, so it is shown without a penalty.',
        points: [
          'Search, AI search, training and user-fetch crawlers kept apart',
          'robots.txt history across crawls',
          'llms.txt reported as a diagnostic, not scored',
        ],
        media: { kind: 'split', screen: 'crawler-access' },
      },
      {
        title: 'From a finding to a verified fix',
        body: 'A technical defect that repeats across pages, usually from a shared template, is one Action covering every affected page, not one per page. Hand it to the Agent with the failing check and the affected pages so it writes one fix, or prepare a developer ticket with the dated evidence. Your team implements it, marks it done, and the next comparable crawl reports it verified, partially resolved, still failing or inconclusive.',
        points: [
          'One Action for a defect across all its pages',
          'Developer ticket in Markdown, with a minimal patch',
          'Pages still failing named after the recrawl',
          'CSV and Markdown exports for your developers',
        ],
        media: { kind: 'split', screen: 'agent-chat' },
      },
    ],
    steps: [
      {
        title: 'Crawl',
        body: 'CiteLadder samples your site within your plan’s page allowance, on demand or on a weekly or monthly schedule, respecting robots.txt unless you choose otherwise.',
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
        q: 'Can crawls run on a schedule?',
        a: 'Yes, on every plan. Turn on a weekly or monthly schedule for a project and each run repeats the latest crawl’s scope and settings. Schedules are off until you turn them on.',
      },
      {
        q: 'Does the crawl respect robots.txt?',
        a: 'Yes, by default. For your own site you can run a crawl that ignores robots.txt after confirming you are authorized to crawl it; crawl delay, rate limits and access controls still apply, and pages fetched despite an exclusion are marked. Every other fetch, such as competitor, cited-source and product pages, always respects robots.txt.',
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
    closing: 'Hand your developers a fix list with the evidence attached',
    related: [
      '/platform/content-optimization',
      '/platform/search-demand',
      '/platform/agents',
      '/platform/ai-visibility',
      '/tools',
      '/blog/auditing-content-for-llms-ai-search',
    ],
  },
  {
    path: '/platform/search-demand',
    updated: '2026-11-18',
    title: 'Search Demand & GSC Opportunity Analysis | CiteLadder',
    description:
      'Find the Search Console queries ranking at positions 4 to 15, pages with weak click-through, two pages competing for one query, and queries rising or falling.',
    heading: 'Find the pages your search data says to update first',
    lead: 'Use your Google Search Console data to find the pages closest to winning more traffic.',
    cta: 'demo',
    screen: 'demand',
    highlights: [
      {
        title: 'Striking distance',
        body: 'Non-branded queries at an average position of 4 to 15 with at least 50 impressions, each tied to the page that ranks.',
      },
      {
        title: 'CTR gaps',
        body: 'Queries clicked at least 25% and 2 points less often than your median for the same position.',
      },
      {
        title: 'Demand shifts',
        body: 'Queries whose impressions rose or fell sharply between the last two 14-day periods. Branded searches are counted separately.',
      },
    ],
    features: [
      {
        title: 'Seven signals, each tied to a page',
        body: 'Search Demand reads your Search Console queries and pages and raises a signal when a pattern passes its threshold. Each signal names the query, the page and the reporting window it came from.',
        points: [
          'Queries with 10 or more impressions and a click-through of 2% or less',
          'Queries at positions 4 to 15, and click-through below your own norm',
          'Two pages each taking at least 10% of one query’s impressions',
          'Emerging and declining queries, with branded searches counted apart',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Queries in their landing-page context',
        body: 'See what each page appears for before you change it. Where CiteLadder can read the page, it checks whether the query’s terms appear in the title, H1 and main content, and lists the terms that are missing.',
        points: [
          'Grouped by page or by query',
          'Reporting window and source on every row',
          'Missing query terms listed for the title and H1',
          'Ambiguous queries labelled as ambiguous',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'From a signal to a reviewable edit',
        body: 'Signals become page Actions beside your Site Health and visibility findings. Open the evidence behind any Action and hand it to the Agent to draft a change to that page. The next reporting window shows whether the query moved.',
        points: [
          'Signals become page Actions',
          'The handoff includes the evidence',
          'Changes measured against the earlier window',
        ],
        media: { kind: 'full', screen: 'actions' },
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
      'Which queries rank between 4 and 15, and which page ranks for each?',
      'Which pages get impressions but not clicks?',
      'Are two of our pages competing for the same query?',
      'Which queries are rising or falling, outside our brand name?',
      'Does the page that ranks actually answer the query?',
    ],
    faqs: [
      {
        q: 'Which signals does Search Demand find?',
        a: 'Seven signals: high impressions with low click-through, striking-distance queries at positions 4 to 15, click-through below your median for the same position, two pages competing for one query, query terms missing from the ranking page, and emerging and declining queries. Branded query performance is reported separately.',
      },
      {
        q: 'Is this data from private AI conversations?',
        a: 'No. Search Demand uses your connected Search Console data. Suggested prompts are suggestions, not AI search volumes.',
      },
      {
        q: 'How is this different from Keyword Research?',
        a: 'Search Demand uses your own Search Console data. Keyword Research adds external keyword, competitor and backlink research when you need it. In the app, Search Demand is the first tab of the Keyword research page.',
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
    closing: 'Start with the queries you already rank for',
    related: [
      '/platform/keyword-research',
      '/platform/site-health',
      '/platform/content-optimization',
      '/platform/integrations',
    ],
  },
  {
    path: '/platform/keyword-research',
    updated: '2026-11-06',
    title: 'Keyword, Competitor & Backlink Research | CiteLadder',
    description:
      'Research keywords, competing domains, top pages and backlinks with optional DataForSEO datasets, priced and confirmed before collection.',
    heading: 'Keyword and backlink research beside your AI evidence',
    lead: 'See the keywords and links your competitors win, and where you can catch up.',
    cta: 'setup',
    screen: 'keywords',
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
        title: 'Cost shown before you buy',
        body: 'Every new collection shows its scope and maximum cost, and runs only after you confirm.',
      },
    ],
    features: [
      {
        title: 'Review the scope and cost first',
        body: 'New research uses a review-and-confirm step: you see the target, market, row limit and maximum cost before anything is bought. Opening a saved dataset never buys a refresh, and results the provider did not return stay marked as missing.',
        points: [
          'Target, market and row limit up front',
          'Maximum cost before you confirm',
          'Saved datasets reopen for free',
          'CSV export of saved datasets',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Keywords your competitors rank for and you miss',
        body: 'Compare ranking keywords across your domain and your competitors. A keyword with a search volume of 50 or more, where a competitor ranks in the top ten and you do not, becomes a keyword Action beside your other evidence.',
        points: [
          'Ranking, shared and missing keywords',
          'Keyword suggestions around a seed',
          'Up to 25 keyword-gap Actions per refresh',
        ],
        media: { kind: 'split', screen: 'actions' },
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
        q: 'Is Keyword Research in the free trial?',
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
        a: 'A keyword with a search volume of 50 or more where a competitor ranks in the top ten and you do not. Navigational keywords are left out, and up to 25 are raised per refresh.',
      },
    ],
    closing: 'Research the questions your own data cannot answer',
    related: [
      '/platform/search-demand',
      '/platform/cited-sources',
      '/platform/content-optimization',
      '/platform/integrations',
    ],
  },
];
