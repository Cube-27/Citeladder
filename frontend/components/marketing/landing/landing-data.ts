/** Public copy for the landing page's integration list and FAQ. */

import type { EngineKey } from '@/components/ui/engine-mark';

/**
 * An integration's logo: engine marks the site already draws inline, or a
 * logo file fetched once from logo.dev and served from `public/brand/integrations`.
 */
export type IntegrationMark =
  | { readonly kind: 'engines'; readonly engines: readonly EngineKey[] }
  | { readonly kind: 'image'; readonly src: string };

export type Integration = {
  readonly title: string;
  readonly body: string;
  readonly mark: IntegrationMark;
};

export const INTEGRATIONS: readonly Integration[] = [
  {
    title: 'Google Search Console',
    body: 'Queries, pages and clicks from your verified property.',
    mark: { kind: 'engines', engines: ['google'] },
  },
  {
    title: 'Google Analytics 4',
    body: 'AI referral sessions, landing pages and key events.',
    mark: { kind: 'engines', engines: ['google'] },
  },
  {
    title: 'Bing Webmaster Tools',
    body: 'Bing search data through its own consent flow.',
    mark: { kind: 'image', src: '/brand/integrations/bing.png' },
  },
  {
    title: 'Model providers',
    body: 'OpenAI, Google and Anthropic accounts for audits.',
    mark: { kind: 'engines', engines: ['chatgpt', 'gemini', 'claude'] },
  },
  {
    title: 'DataForSEO',
    body: 'Optional keyword, competitor and backlink research.',
    mark: { kind: 'image', src: '/brand/integrations/dataforseo.png' },
  },
  {
    title: 'MCP clients',
    body: 'Use your project evidence from your own AI assistant.',
    mark: { kind: 'image', src: '/brand/integrations/mcp.png' },
  },
];

export const FAQS = [
  {
    q: 'What does CiteLadder do besides tracking AI answers?',
    a: 'It lists the sources behind each answer, crawls your site, adds Search Console and GA4 data, and drafts fixes for you to review.',
  },
  {
    q: 'Which AI engines do you track?',
    a: 'ChatGPT, Gemini, Claude and Google AI Overviews, depending on your plan. The free trial covers ChatGPT answers. Answers come from the consumer apps and provider APIs, so one can differ from what a signed-in user sees.',
  },
  {
    q: 'What does the free trial include?',
    a: 'Seven days of AI visibility tracking on ChatGPT for one project, with limits on prompts and answers. The Agent and advanced workflows are not part of the trial; book a demo to explore them.',
  },
  {
    q: 'Does CiteLadder change my website or publish content?',
    a: 'Not on its own. The Agent prepares briefs, edits and plans for your team to review. You publish them.',
  },
  {
    q: 'Can CiteLadder prove that a change caused a visibility gain?',
    a: 'No tool can. CiteLadder records what changed and when, and keeps measurements comparable.',
  },
] as const;
