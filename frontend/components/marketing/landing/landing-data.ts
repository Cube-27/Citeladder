/** Public copy for the landing page's integration list and FAQ. */

import type { OfficialEngineKey } from '../primitives/engine-logo';

/**
 * An integration's logo: brand marks the site already draws inline, or a
 * logo file fetched once from logo.dev and served from `public/brand/integrations`.
 */
export type IntegrationMark =
  | { readonly kind: 'engines'; readonly engines: readonly OfficialEngineKey[] }
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
    mark: { kind: 'engines', engines: ['openai', 'gemini', 'claude'] },
  },
  {
    title: 'DataForSEO',
    body: 'Optional keyword, competitor and backlink research.',
    mark: { kind: 'image', src: '/brand/integrations/dataforseo.png' },
  },
  {
    title: 'MCP clients',
    body: 'Read your project evidence and make changes you confirm from compatible assistants.',
    mark: { kind: 'image', src: '/brand/integrations/mcp.png' },
  },
];

export const FAQS = [
  {
    q: 'Is CiteLadder just an AI visibility tracker?',
    a: 'No. Visibility is where it starts. CiteLadder also traces the sources behind each answer, audits your site, brings in Search Console and GA4 data, and helps your team turn findings into reviewable work.',
  },
  {
    q: 'Which AI engines do you track?',
    a: 'ChatGPT, Gemini, Claude and Google AI Overviews, depending on your plan. The free trial covers ChatGPT answers. CiteLadder collects answers to your prompts from the consumer apps and from provider APIs, and a collected answer can differ from what a signed-in user sees.',
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
