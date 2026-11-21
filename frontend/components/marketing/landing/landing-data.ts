/** Public copy for the landing page's integration field and FAQ. */

import type { ComponentType, SVGProps } from 'react';

import type { EngineKey } from '@/components/ui/engine-mark';
import { Cloud } from '@/lib/icons';
import { PUBLIC_TRIAL } from '@/lib/config/public-trial';
import { countWordCapitalized, projectCount } from '@/lib/marketing-content/count-words';

import { McpMark } from './mcp-mark';

/**
 * An integration's logo: an engine mark the site already draws inline, a
 * logo file served from `public/brand/integrations`, or an inline mark in ink
 * (a lucide icon for a source without a usable logo).
 */
export type IntegrationMark =
  | { readonly kind: 'engine'; readonly engine: EngineKey }
  | { readonly kind: 'image'; readonly src: string }
  | { readonly kind: 'icon'; readonly icon: ComponentType<SVGProps<SVGSVGElement>> };

export type Integration = {
  readonly title: string;
  readonly mark: IntegrationMark;
};

export const INTEGRATIONS: readonly Integration[] = [
  {
    title: 'Google Search Console',
    mark: { kind: 'image', src: '/brand/integrations/googlesearchconsole.png' },
  },
  {
    title: 'Google Analytics 4',
    mark: { kind: 'image', src: '/brand/integrations/googleanalytics.png' },
  },
  { title: 'Bing Webmaster Tools', mark: { kind: 'image', src: '/brand/integrations/bing.png' } },
  { title: 'OpenAI', mark: { kind: 'engine', engine: 'chatgpt' } },
  { title: 'Google Gemini', mark: { kind: 'engine', engine: 'gemini' } },
  { title: 'Anthropic', mark: { kind: 'engine', engine: 'claude' } },
  { title: 'DataForSEO', mark: { kind: 'image', src: '/brand/integrations/dataforseo.png' } },
  { title: 'MCP clients', mark: { kind: 'icon', icon: McpMark } },
  { title: 'Shopify', mark: { kind: 'image', src: '/brand/integrations/shopify.png' } },
  {
    title: 'Google Merchant Center',
    mark: { kind: 'image', src: '/brand/integrations/google.png' },
  },
  { title: 'Cloudflare', mark: { kind: 'image', src: '/brand/integrations/cloudflare.png' } },
  { title: 'Amazon CloudFront', mark: { kind: 'icon', icon: Cloud } },
  { title: 'Google Cloud', mark: { kind: 'image', src: '/brand/integrations/googlecloud.png' } },
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
    a: `${countWordCapitalized(PUBLIC_TRIAL.days)} days of AI visibility tracking on ChatGPT for ${projectCount(PUBLIC_TRIAL.projects)}, with limits on prompts and answers. The Agent and advanced workflows are not part of the trial; book a demo to explore them.`,
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
