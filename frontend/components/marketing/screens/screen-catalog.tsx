import type { ComponentType } from 'react';

import type { PlatformScreen } from '@/lib/marketing-content/platform-pages';

import { ProductFrame, type FrameFit } from './product-frame';
import { ScreenActions, ScreenAgentBrief, ScreenAgentChat, ScreenCommerce } from './screens-agent';
import {
  ScreenDemand,
  ScreenEngines,
  ScreenKeywords,
  ScreenPerception,
  ScreenReferrals,
} from './screens-search';
import {
  ScreenCrawlerAccess,
  ScreenIntegrations,
  ScreenMcp,
  ScreenSiteHealth,
} from './screens-site';
import {
  ScreenAnswer,
  ScreenCitedUrl,
  ScreenPrompts,
  ScreenSources,
  ScreenVisibility,
} from './screens-visibility';

type CatalogEntry = Readonly<{
  View: ComponentType;
  /** `scale` for a full app screen that fills a full-width frame; `fluid` for a vignette. */
  fit: FrameFit;
  /** What the screen shows, for screen readers. */
  label: string;
}>;

const vignette = (View: ComponentType, label: string): CatalogEntry => ({
  View,
  fit: 'fluid',
  label,
});

/**
 * The product image catalogue: every screen with its fit and label, so a
 * page picks a screen and never sets up a frame itself.
 */
export const SCREEN_CATALOG: Readonly<Record<PlatformScreen, CatalogEntry>> = {
  visibility: {
    View: ScreenVisibility,
    fit: 'scale',
    label: 'The Visibility page for Acme Analytics',
  },
  prompts: vignette(ScreenPrompts, 'The tracked prompts for Acme Analytics'),
  keywords: vignette(ScreenKeywords, 'Keyword research for acme.com'),
  actions: vignette(ScreenActions, 'Actions for acme.com, highest priority first'),
  answer: vignette(ScreenAnswer, 'A ChatGPT answer that names Acme Analytics first'),
  sources: vignette(ScreenSources, 'Domains cited in answers about Acme Analytics'),
  'cited-url': vignette(ScreenCitedUrl, 'acme.com/pricing: which engines retrieve and cite it'),
  'site-health': vignette(ScreenSiteHealth, 'Site Health for acme.com: score 82, 7 failed checks'),
  'crawler-access': vignette(ScreenCrawlerAccess, 'AI crawler access to acme.com from robots.txt'),
  demand: vignette(ScreenDemand, 'Search Console clicks, CTR and position for acme.com'),
  referrals: vignette(ScreenReferrals, 'Sessions referred to acme.com by AI assistants'),
  perception: vignette(ScreenPerception, 'How AI engines describe Acme Analytics'),
  engines: vignette(ScreenEngines, 'Acme Analytics visibility on each engine'),
  'agent-chat': vignette(ScreenAgentChat, 'The Agent answering why Acme dropped on Gemini'),
  'agent-brief': vignette(
    ScreenAgentBrief,
    'A content brief the Agent drafted for a session replay pricing page',
  ),
  mcp: vignette(ScreenMcp, 'Read-only tool calls an assistant made to the CiteLadder MCP server'),
  integrations: vignette(ScreenIntegrations, 'Data sources connected to acme.com'),
  commerce: vignette(ScreenCommerce, 'Which products AI answers recommended for Acme Startup'),
};

/** One catalogue screen in its ProductFrame. */
export function CatalogFrame({ screen }: Readonly<{ screen: PlatformScreen }>) {
  const { View, label, fit } = SCREEN_CATALOG[screen];
  return (
    <ProductFrame label={label} fit={fit}>
      <View />
    </ProductFrame>
  );
}
