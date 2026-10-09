/** Public copy for the landing page's integration list and FAQ. */

export const INTEGRATIONS = [
  ['GSC', 'Google Search Console', 'Queries, pages and clicks from your verified property.'],
  ['GA4', 'Google Analytics 4', 'AI referral sessions, landing pages and key events.'],
  ['BING', 'Bing Webmaster Tools', 'Bing search data through its own consent flow.'],
  ['AI', 'Model providers', 'OpenAI, Google and Anthropic accounts for audits.'],
  ['DFS', 'DataForSEO', 'Optional keyword, competitor and backlink research.'],
  ['MCP', 'MCP clients', 'Read your project evidence from compatible assistants.'],
] as const;

export const FAQS = [
  {
    q: 'Is CiteLadder just an AI visibility tracker?',
    a: 'No. Visibility is where it starts. CiteLadder also traces the sources behind each answer, audits your site, brings in Search Console and GA4 data, and helps your team turn findings into reviewable work.',
  },
  {
    q: 'Which AI engines do you track?',
    a: "ChatGPT, Gemini, Claude and Google AI Overviews, depending on your plan. The free trial covers ChatGPT answers. CiteLadder collects answers to your prompts through each provider's API, and these can differ from what a consumer app shows.",
  },
  {
    q: 'What does the free trial include?',
    a: 'Seven days of AI visibility tracking on ChatGPT for one project, with limits on prompts and answers. The Agent and advanced workflows are not part of the trial; book a demo to explore them.',
  },
  {
    q: 'Does CiteLadder change my website or publish content?',
    a: 'Never on its own. The Agent prepares briefs, edits and plans for your team to review. Publishing and site changes stay with you.',
  },
  {
    q: 'Can CiteLadder prove that a change caused a visibility gain?',
    a: 'No tool can prove that. CiteLadder keeps each measurement comparable and records what changed and when, so your team can judge the evidence instead of trusting a guess.',
  },
] as const;
