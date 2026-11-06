import { MCP_SERVER_URL } from '@/lib/config/mcp-clients';
import { AGENT_NOTE, type PlatformPage } from './platform-page-types';

/** Action and connection capabilities: content, the Agent, MCP and integrations. */
export const IMPROVE_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/content-briefs',
    updated: '2026-11-06',
    title: 'Evidence-Backed AI Content Optimization | CiteLadder',
    description:
      'Prepare content briefs, page edits, comparison pages, internal-link plans and outreach briefs from your CiteLadder evidence, and review every revision before it ships.',
    heading: 'Content work that starts from the evidence',
    lead: 'Turn what you learn into page updates and new content, ready for your team to review.',
    cta: 'demo',
    screen: 'actions',
    note: AGENT_NOTE,
    highlights: [
      {
        title: 'Briefs and new pages',
        body: 'Full drafts for the audience and evidence you choose, including comparison pages and FAQs.',
      },
      {
        title: 'Edits to existing pages',
        body: 'A proposed edit for one target page at a time, which your team reviews before it ships.',
      },
      {
        title: 'Links and earned media',
        body: 'Internal-link plans and outreach briefs for the third-party pages that cite your competitors.',
      },
    ],
    features: [
      {
        title: 'Start from a gap you can see',
        body: 'Every piece of content work starts from evidence already in your project: an Action, a Site Health issue, a Search Console signal, a cited page that leaves you out, or a prompt you lose. The Agent reads that evidence first and writes the draft to close that gap.',
        points: [
          'Pick up any Action or finding as the starting point',
          'Business context and competitors carried into every draft',
          'The context used is listed with each output',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Drafts for your site and the places engines cite',
        body: 'AI answers draw on your site and on the places people discuss your category. The Agent drafts new pages and edits for your site, and social posts, forum answers and outreach briefs for the channels engines cite.',
        points: [
          'Briefs, new pages, comparison pages and FAQ pages',
          'Page edits and internal-link plans',
          'LinkedIn and X posts, video scripts and forum answers',
          'Outreach briefs for earned sources',
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
        title: 'Pick a starting point',
        body: 'Choose an Action, finding or question, or start a new chat with a content skill.',
      },
      {
        title: 'Get the full draft',
        body: 'The Agent writes the whole piece from the evidence it read, and lists the context it used.',
      },
      {
        title: 'Review the draft',
        body: 'Edit sections, ask for changes the Agent makes in place, and compare revisions.',
      },
      {
        title: 'Ship and measure',
        body: 'Publish through your own process, mark the work implemented, and watch later evidence.',
      },
    ],
    questions: [
      'What should our comparison page against a named competitor say?',
      'Which page should we update to answer a prompt we keep losing?',
      'Which internal links would help a page that answers engines skip?',
      'What should we pitch to a publisher that lists our competitors?',
    ],
    faqs: [
      {
        q: 'Is this a separate application?',
        a: "No. Content workflows run in CiteLadder's Agent, connected to your project evidence and Actions.",
      },
      {
        q: 'What can it produce?',
        a: 'Content briefs, new pages, comparison pages, FAQ pages, edits to existing pages, internal-link plans, outreach briefs, social posts, video scripts and forum answers.',
      },
      {
        q: 'Does it publish automatically?',
        a: 'No. Drafting, saving, publishing and measuring are separate decisions your team makes.',
      },
      {
        q: 'Will it invent facts about my company?',
        a: 'The Agent works from your confirmed business context and saved evidence, and it is instructed not to invent company, product, customer, price or statistic facts. Your team reviews every draft before it is used.',
      },
      {
        q: 'Is it in the free trial?',
        a: 'No. Content workflows run in the Agent, which is not part of the free trial. Book a demo to try it with your own project.',
      },
    ],
    closing: 'Turn a gap you can see into a draft your team can ship',
    related: [
      '/platform/agents',
      '/platform/site-health',
      '/platform/search-demand',
      '/platform/keyword-research',
      '/platform/cited-sources',
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
    related: ['/platform/content-briefs', '/platform/site-health', '/platform/mcp', '/platform'],
  },
  {
    path: '/platform/mcp',
    updated: '2026-11-06',
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
        body: 'Read visibility results and trends, perception, ads, cited sources, Actions, Site Health, performance, AI referrals, AI crawler logs, the AI Shelf, search performance and saved Keyword Research datasets. Every answer comes from a dated record.',
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
          'With Allow changes: add prompts, track or drop competitors, launch audits and schedules, and dismiss or mark Actions implemented, each after you agree; no crawls, purchases or publishing',
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
    updated: '2026-11-06',
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
        a: 'No. Commerce catalogs come from your site or a CSV import.',
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
