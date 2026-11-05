import type { ComponentType } from 'react';

import type { PlatformScreen } from '@/lib/marketing-content/platform-pages';

import { ProductFrame, type FrameAspect } from './product-frame';
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
  /** 1200-wide screens fill full-width frames; 960-wide ones sit in splits and tiles. */
  width: 1200 | 960;
  aspect: FrameAspect;
  /** What the screen shows, for screen readers. */
  label: string;
}>;

/**
 * The product image catalogue: every screen at its one frame preset, so a
 * page picks a screen and never sets a frame's ratio or inset itself.
 */
export const SCREEN_CATALOG: Readonly<Record<PlatformScreen, CatalogEntry>> = {
  visibility: {
    View: ScreenVisibility,
    width: 1200,
    aspect: 'hero',
    label: 'The Visibility page for Acme Analytics',
  },
  prompts: {
    View: ScreenPrompts,
    width: 1200,
    aspect: 'hero',
    label: 'The tracked prompts table for Acme Analytics',
  },
  keywords: {
    View: ScreenKeywords,
    width: 1200,
    aspect: 'hero',
    label: 'Keyword research for acme.com',
  },
  actions: {
    View: ScreenActions,
    width: 1200,
    aspect: 'hero',
    label: 'Actions for acme.com with the selected action open',
  },
  answer: {
    View: ScreenAnswer,
    width: 960,
    aspect: 'standard',
    label: 'A ChatGPT answer that names Acme Analytics first',
  },
  sources: {
    View: ScreenSources,
    width: 960,
    aspect: 'wide',
    label: 'Domains cited in answers about Acme Analytics',
  },
  'cited-url': {
    View: ScreenCitedUrl,
    width: 960,
    aspect: 'wide',
    label: 'acme.com/pricing: which engines retrieve and cite it',
  },
  'site-health': {
    View: ScreenSiteHealth,
    width: 960,
    aspect: 'wide',
    label: 'Site Health for acme.com: score 82, 7 failed checks',
  },
  'crawler-access': {
    View: ScreenCrawlerAccess,
    width: 960,
    aspect: 'wide',
    label: 'AI crawler access to acme.com from robots.txt',
  },
  demand: {
    View: ScreenDemand,
    width: 960,
    aspect: 'standard',
    label: 'Search Console clicks and top queries for acme.com',
  },
  referrals: {
    View: ScreenReferrals,
    width: 960,
    aspect: 'standard',
    label: 'Sessions referred to acme.com by AI assistants',
  },
  perception: {
    View: ScreenPerception,
    width: 960,
    aspect: 'wide',
    label: 'How AI engines describe Acme Analytics',
  },
  engines: {
    View: ScreenEngines,
    width: 960,
    aspect: 'standard',
    label: 'Acme Analytics visibility on each engine',
  },
  'agent-chat': {
    View: ScreenAgentChat,
    width: 960,
    aspect: 'standard',
    label: 'The Agent answering why Acme dropped on Gemini',
  },
  'agent-brief': {
    View: ScreenAgentBrief,
    width: 960,
    aspect: 'standard',
    label: 'A content brief the Agent drafted for a session replay pricing page',
  },
  mcp: {
    View: ScreenMcp,
    width: 960,
    aspect: 'wide',
    label: 'The CiteLadder MCP server: its tools and one call',
  },
  integrations: {
    View: ScreenIntegrations,
    width: 960,
    aspect: 'standard',
    label: 'Data sources and AI assistants connected to acme.com',
  },
  commerce: {
    View: ScreenCommerce,
    width: 960,
    aspect: 'wide',
    label: 'Which products AI answers recommended for Acme Startup',
  },
};

/** One catalogue screen in its frame preset: 1200-wide at inset 48, 960-wide at 32. */
export function CatalogFrame({ screen }: Readonly<{ screen: PlatformScreen }>) {
  const { View, width, aspect, label } = SCREEN_CATALOG[screen];
  return (
    <ProductFrame aspect={aspect} inset={width === 1200 ? 48 : 32} label={label}>
      <View />
    </ProductFrame>
  );
}
