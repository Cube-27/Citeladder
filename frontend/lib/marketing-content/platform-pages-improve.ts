import { MCP_SERVER_URL } from '@/lib/config/mcp-clients';
import { AGENT_NOTE, type PlatformPage } from './platform-page-types';

/** Action and connection capabilities: content, the Agent, MCP and integrations. */
export const IMPROVE_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/content-optimization',
    updated: '2026-11-10',
    title: 'AI Content Optimization Grounded in Citations | CiteLadder',
    description:
      'AI content optimization from your tracked answers: see the content angles competitors and publishers get cited for, then improve a page or write one with the Agent.',
    heading: 'Find the content AI answers cite and your site lacks',
    lead: 'See the topics AI answers cite your competitors and publishers for, and get a page to improve or a page to write for each one.',
    cta: 'demo',
    screen: 'content-optimization',
    note: AGENT_NOTE,
    highlights: [
      {
        title: 'Content angles',
        body: 'You use this after your visibility runs, and it gives you the competitor and publisher pages AI answers cite for your prompts, grouped by topic into content angles.',
      },
      {
        title: 'A page to improve or a page to write',
        body: 'When one of your content pages matches an angle but is not cited, you get an Action to improve it. When none matches, you get a planned page to write.',
      },
      {
        title: 'The evidence on every Action',
        body: 'Each Action lists the cited pages behind its angle, with their title, site, classification and citation counts, and the dates they come from.',
      },
    ],
    features: [
      {
        title: 'See what AI answers cite on other sites',
        body: 'After a visibility run, CiteLadder reads the titles of the competitor and publisher pages AI answers cite for your prompts and groups them by prompt topic into content angles, such as a pricing comparison or a setup guide. A model only groups and names the titles. The counts, prompts, engines and whether your own page is cited come from your stored answers.',
        points: [
          'Pages from competitor sites and from editorial and publisher sites',
          'Forums, social sites, directories and marketplaces left out',
          'Grouped by the topics of your tracked prompts',
          'Refreshed after each new visibility run or crawl',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Content work in Actions',
        body: 'Pages to improve and pages to write appear in Actions, in the same priority order as the rest of your work. Each Action names the page, or a planned page to write, and lists its angle, the prompts the angle covers, and the sites and competitors cited for it. You get counts from the evidence, with no content scores or grades.',
        points: [
          'Articles, guides, how-tos, listicles, comparison, alternative and case study pages',
          'A planned page, named by its angle, when no content page matches',
          'Site Health findings on a content page share its Action',
          'Why this matters shows the cited pages for each angle',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Hand the page to the Agent',
        body: 'Open an Action and choose Write this page for a planned page, or Work on this for one of your pages. The chat is attached to the Action, so the Agent starts from its evidence and your confirmed business context and writes the whole draft.',
        points: [
          'Write this page drafts a new article or guide',
          'Work on this refreshes the existing page',
          'The context used is listed with each draft',
        ],
        media: { kind: 'split', screen: 'agent-brief' },
      },
      {
        title: 'Every draft keeps its revisions',
        body: 'The Agent writes the whole piece and edits it in place. Edit sections yourself, ask for a change to one part, and compare any version with the latest.',
        points: [
          'The full draft first, edited in place',
          'Section-level edits and follow-ups',
          'Full revision history',
        ],
        media: { kind: 'split', screen: 'agent-chat' },
      },
    ],
    steps: [
      {
        title: 'Run visibility audits',
        body: 'Track your buyer prompts. After each run, CiteLadder groups the pages AI answers cite into content angles.',
      },
      {
        title: 'Open Actions',
        body: 'See the content pages to improve and the planned pages to write among your Actions, each with its angle and the sites cited for it.',
      },
      {
        title: 'Hand it to the Agent',
        body: 'Choose Write this page or Work on this, then review and revise the draft.',
      },
      {
        title: 'Ship and check',
        body: 'Publish through your own process, mark the work implemented, and see in later runs whether AI answers cite your page.',
      },
    ],
    questions: [
      'Which topics do AI answers cite our competitors for when we have no page on them?',
      'Which of our guides covers a topic but never gets cited?',
      'Which publisher pages do AI answers cite for our pricing comparison prompts?',
      'Which new page should we write next, and which pages is it up against?',
    ],
    faqs: [
      {
        q: 'What does content optimization do in CiteLadder?',
        a: 'It groups the competitor and publisher pages AI answers cite for your prompts into content angles, checks whether one of your content pages covers each angle and is cited, and lists the gaps as pages to improve or pages to write. The Agent then drafts the work for your team to review.',
      },
      {
        q: 'Where does the evidence come from?',
        a: 'From your own visibility runs: the titles of the competitor and publisher pages cited for your tracked prompts. Your content pages come from your latest Site Health crawl.',
      },
      {
        q: 'Does it score or grade my content?',
        a: 'No. Each Action shows counts from the evidence: the prompts an angle covers and the sites and competitors cited for it.',
      },
      {
        q: 'Does it publish automatically?',
        a: 'No. Drafting, publishing and marking the work implemented are separate decisions your team makes.',
      },
      {
        q: 'Will it invent facts about my company?',
        a: 'The Agent works from your confirmed business context and saved evidence, and it is instructed not to invent company, product, customer, price or statistic facts. Your team reviews every draft before it is used.',
      },
      {
        q: 'Is it in the free trial?',
        a: 'The Agent, which writes the drafts, is not part of the free trial. Book a demo to try content optimization with your own project.',
      },
    ],
    closing: 'Find your next page in the pages AI answers cite',
    related: [
      '/blog/how-to-optimize-content-for-ai-search',
      '/platform/agents',
      '/platform/cited-sources',
      '/platform/site-health',
      '/platform/ai-visibility',
      '/platform/search-demand',
    ],
  },
  {
    path: '/platform/agents',
    updated: '2026-11-06',
    title: 'AI SEO Assistant Grounded in Your Evidence | CiteLadder',
    description:
      'An AI assistant that reads your saved CiteLadder evidence and produces briefs, edits and plans you review. It never publishes on its own.',
    heading: 'An assistant that starts from your evidence',
    lead: 'Ask about your AI visibility and get clear answers and drafts based on your own data.',
    cta: 'demo',
    screen: 'actions',
    note: AGENT_NOTE,
    highlights: [
      {
        title: 'Grounded answers',
        body: 'It reads the visibility, site, demand and traffic records in your project before it answers.',
      },
      {
        title: 'Skills for the job',
        body: 'Diagnosis, content, technical fixes, internal links, earned media, growth plans and prompt portfolios.',
      },
      {
        title: 'Read-only',
        body: 'It reads your project. It cannot publish, contact anyone or change your site.',
      },
    ],
    features: [
      {
        title: 'Hand off from any finding',
        body: 'Ask the Agent from Site Health, Search Demand or Keyword Research and the evidence comes with it. Mention open Actions to bring their diagnoses into the conversation. Each step it reads is shown as it works.',
        points: [
          'The evidence travels with the handoff',
          'One deliverable per conversation',
          'Step-by-step reads shown as it works',
        ],
        media: { kind: 'split', screen: 'agent-chat' },
      },
      {
        title: 'One skill per job',
        body: 'Each skill tells the Agent which evidence to read and what to hand back, such as a growth plan, a fix brief or a comparison page.',
        points: [
          'AI visibility diagnosis and growth plans',
          'Technical health and internal links',
          'Content, comparison pages and programmatic page pilots',
          'Search Console optimization, search opportunities and earned authority',
          'Prompt discovery and measuring results',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'What the Agent cannot do',
        body: 'The Agent uses the same read tools as the CiteLadder MCP server, inside limits set for each run. It cannot crawl, buy data, change prompts, publish, browse the open web or contact anyone, and it never declares that a change worked without new evidence.',
        points: [
          'Reads only the project you are in',
          'Step and size limits on every run',
          'Outputs are reviewable drafts with revisions',
        ],
        media: { kind: 'split', screen: 'agent-brief' },
      },
    ],
    steps: [
      {
        title: 'Open the Agent',
        body: 'Switch from Dashboard to Agent, or ask from any finding.',
      },
      {
        title: 'Choose a skill',
        body: 'Pick the job, or describe it and let the Agent suggest one.',
      },
      {
        title: 'Watch it read',
        body: 'The Agent reads the evidence it needs and explains what it found.',
      },
      {
        title: 'Review the output',
        body: 'Revise the deliverable, then take it into your own workflow.',
      },
    ],
    questions: [
      'Why does a competitor win comparisons we lose?',
      'What should we fix first across our open Actions?',
      'Which prompts are missing from our portfolio?',
      'What is a realistic growth plan for next quarter?',
      'Did the changes we shipped last month move anything?',
    ],
    faqs: [
      {
        q: 'Does the Agent fix every affected page automatically?',
        a: 'No. It prepares bounded, reviewable work for a specific target. Your team decides what to implement.',
      },
      {
        q: 'What can the Agent see?',
        a: 'The saved evidence in the project you are working in: visibility results, sources, Site Health, Search Console, GA4, AI traffic, saved research and Actions. It does not browse the open web.',
      },
      {
        q: 'Which model does it use?',
        a: 'The Agent runs on models CiteLadder hosts, and each turn uses AI credits from your plan.',
      },
      {
        q: 'Can it take actions on my behalf?',
        a: 'No. It has no write tools. It cannot publish, send messages, activate prompts, start crawls, buy data or change your site.',
      },
      {
        q: 'Is the Agent in the free trial?',
        a: 'No. Book a demo to try it with your own project.',
      },
    ],
    closing: 'Ask about your project and get a draft you can review',
    related: [
      '/platform/content-optimization',
      '/platform/site-health',
      '/platform/mcp',
      '/platform',
    ],
  },
  {
    path: '/platform/mcp',
    updated: '2026-11-11',
    title: 'AI Visibility MCP Server for Claude, ChatGPT & More | CiteLadder',
    description:
      'Connect Claude, ChatGPT, Gemini, Grok, Cursor and other MCP clients to your CiteLadder visibility, site and search evidence, with changes only after you confirm them.',
    heading: 'Your CiteLadder evidence, in your AI assistant',
    lead: 'Ask Claude, ChatGPT and other assistants about your AI visibility, right where you already work.',
    cta: 'mcp',
    screen: 'mcp',
    highlights: [
      {
        title: '1. Connect',
        body: `Use Connect, or add ${MCP_SERVER_URL} as a custom connector in your assistant.`,
      },
      {
        title: '2. Sign in and approve',
        body: 'Sign in to CiteLadder, choose which workspaces the assistant may use and whether it may make changes. No API key to copy.',
      },
      {
        title: '3. Ask a question',
        body: 'Try “Which competitors appear most in our latest AI visibility results?”',
      },
    ],
    features: [
      {
        title: 'Ask questions grounded in recorded evidence',
        body: 'Read visibility results and trends, perception, ads, cited sources, Actions, Site Health, performance, AI referrals, AI crawler logs, per-product Commerce metrics, search performance and saved Keyword Research datasets. Every answer comes from a dated record.',
        points: [
          'Interactive visibility and Site Health views in assistants that show apps',
          'Unavailable data is reported as unavailable, never as zero',
          'Links back to the screen in CiteLadder that shows the record',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Briefs and fix lists in your assistant',
        body: 'Use the assistant your team already works in to prepare briefs, reports and fix lists from the same evidence as the app.',
        points: [
          'Weekly AI visibility brief across engines and competitors',
          'Site fix brief from the latest Site Health crawl',
          'With Allow changes: add, activate, archive or refile prompts, track or drop competitors and review suggested ones, launch audits and schedules, and dismiss or mark Actions implemented, each after you agree; no crawls, purchases or publishing',
        ],
        media: { kind: 'full', screen: 'visibility' },
      },
    ],
    steps: [
      {
        title: 'Add the connector',
        body: `Click Connect for your assistant, or paste ${MCP_SERVER_URL} as a custom connector.`,
      },
      {
        title: 'Sign in',
        body: 'Sign in to CiteLadder in your browser. There is no API key to create or paste.',
      },
      {
        title: 'Approve workspaces',
        body: 'Choose which workspaces the assistant may use, and tick Allow changes only if you want it to make changes.',
      },
      {
        title: 'Ask',
        body: 'Ask in plain language. The assistant lists your projects, reads the records it needs and, if you allowed changes, makes the ones you agree to.',
      },
    ],
    questions: [
      'Which competitors appear most in our latest AI visibility results?',
      'Summarize what changed in our AI visibility this week.',
      'Which Site Health issues affect our most-cited pages?',
      'Which sources do AI answers cite for our top prompts?',
      'How much traffic did AI assistants send us last month?',
      'Add five comparison prompts against our top competitor and launch an audit on ChatGPT.',
    ],
    faqs: [
      {
        q: 'What is the CiteLadder MCP server?',
        a: `A hosted Model Context Protocol server at ${MCP_SERVER_URL}. It lets a compatible AI assistant read your CiteLadder project evidence so you can ask questions about it in plain language, show interactive visibility and Site Health views, and, if you allow changes, manage your prompts, topics, competitors, audits and Actions.`,
      },
      {
        q: 'Which assistants does it work with?',
        a: 'Claude, ChatGPT, Gemini, Grok, Cursor, Claude Code and Codex, plus any client that supports remote MCP servers with browser sign-in. Some assistants limit custom connectors by plan or region.',
      },
      {
        q: 'What do I need to connect?',
        a: 'A CiteLadder workspace with an active trial or subscription, and a project for the assistant to read. If you are new, the sign-in step lets you create an account and set up a project first.',
      },
      {
        q: 'Can an assistant change my website or my data through MCP?',
        a: 'Only if you tick Allow changes when you connect it. Then it can add, edit and archive prompts, add, rename and delete topics, add and remove competitors, launch and cancel audits, create schedules and update Actions. Your assistant asks before each change, and larger ones, such as adding prompts or launching an audit, run only after you confirm a preview. It never crawls, buys data, publishes or changes your site.',
      },
      {
        q: 'Does reading a tool refresh the data?',
        a: 'No. It returns saved evidence with its observation date. Refresh data in CiteLadder, then ask again.',
      },
      {
        q: 'What can the assistant see?',
        a: 'Only the workspaces you approve, and only while you remain a member. Data an assistant has already read is held under that assistant’s own terms.',
      },
      {
        q: 'How do I disconnect?',
        a: 'Open Settings → MCP connections in CiteLadder and remove the connection. Workspace Owners and Admins can also remove any connection to their workspace.',
      },
      {
        q: 'Is there a REST API too?',
        a: 'Yes: on paid plans the same data and scoped actions are available through a REST API at https://api.citeladder.com/v1, with keys from Settings → API keys.',
      },
    ],
    closing: 'Ask your assistant about your AI visibility',
    related: ['/platform/integrations', '/platform/agents', '/platform'],
  },
  {
    path: '/platform/integrations',
    updated: '2026-11-11',
    title: 'Search, Analytics, Log & AI Integrations | CiteLadder',
    description:
      'Connect Google Search Console, GA4, Bing Webmaster Tools, Cloudflare, Amazon CloudFront and Google Cloud logs, model providers, DataForSEO and MCP clients to CiteLadder.',
    heading: 'Connect your search, analytics and research data',
    lead: 'Connect the search and analytics tools you already use for a fuller picture.',
    cta: 'setup',
    screen: 'integrations',
    highlights: [
      {
        title: 'Search and analytics',
        body: 'Google Search Console, GA4 and Bing Webmaster Tools, each with its own consent.',
      },
      {
        title: 'Server logs',
        body: 'Cloudflare Worker, Cloudflare Logpush, Amazon CloudFront, Google Cloud, a webhook or a file upload for AI crawler logs.',
      },
      {
        title: 'Models, research and assistants',
        body: 'Model providers for the Agent, DataForSEO for optional research, and MCP access with confirmed changes.',
      },
    ],
    features: [
      {
        title: 'Know what is connected and what is missing',
        body: 'Property mapping, imported windows, freshness and quality notes sit with every connection, so you can tell missing data from a real zero.',
        points: [
          'Search Console queries and pages',
          'GA4 sessions, AI referrals and key events',
          'Bing search data through its own consent',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Send AI crawler logs from your CDN or server',
        body: 'On paid plans, connect the edge you already run. Use a Cloudflare Worker or Logpush job, stream Amazon CloudFront logs, route Google Cloud load balancer and Cloud Run logs through Pub/Sub, post batches to a webhook, or upload a file. CiteLadder shows log coverage per day, so you can see the days with no logs.',
        points: [
          'Cloudflare Worker and Cloudflare Logpush',
          'Amazon CloudFront log streams',
          'Google Cloud load balancer and Cloud Run logs through Pub/Sub',
          'Webhook and file upload for any other server',
          'IP addresses used for verification only, never stored',
        ],
        media: { kind: 'split', screen: 'crawler-access' },
      },
    ],
    steps: [
      {
        title: 'Start with visibility',
        body: 'AI visibility and Site Health work without any integration.',
      },
      {
        title: 'Add first-party data',
        body: 'Connect Search Console, GA4 or Bing when you want demand and referral evidence.',
      },
      {
        title: 'Add logs and research',
        body: 'Send crawler logs or connect DataForSEO when your questions need them.',
      },
      {
        title: 'Connect assistants',
        body: 'Give Claude, ChatGPT and other MCP clients read access, and confirmed changes if you allow them.',
      },
    ],
    questions: [
      'Which Search Console property and GA4 stream feed this project?',
      'How fresh is the data behind this report?',
      'Are our server logs complete for the last month?',
      'Which assistants can read our workspace?',
    ],
    faqs: [
      {
        q: 'Do I need to connect everything?',
        a: 'No. Start with what your workflow needs and add the rest later. AI visibility and Site Health need no integration.',
      },
      {
        q: 'Which integrations are available?',
        a: 'Google Search Console, GA4, Bing Webmaster Tools, AI crawler log sources (Cloudflare Worker, Cloudflare Logpush, Amazon CloudFront, Google Cloud, webhook and upload), DataForSEO, model providers and MCP clients.',
      },
      {
        q: 'Is there a native Shopify sync?',
        a: 'No. Commerce imports a public Shopify storefront by its URL, a Merchant Center feed file or a CSV, and can find products on your site. There is no Shopify app or automatic sync.',
      },
      {
        q: 'Which servers can send crawler logs?',
        a: 'Cloudflare, Amazon CloudFront and Google Cloud load balancers and Cloud Run connect directly. Any other server or CDN can post logs to a webhook or upload a file.',
      },
      {
        q: 'Can I use my own model provider?',
        a: 'For answer-engine and research providers, yes: connect your own keys and those calls bill to your provider account. The Agent always runs on models CiteLadder hosts.',
      },
    ],
    closing: 'Start with AI visibility and add data sources as you need them',
    related: [
      '/platform/search-demand',
      '/platform/keyword-research',
      '/platform/ai-referral-analytics',
      '/platform/ai-visibility',
      '/platform/mcp',
    ],
  },
];
