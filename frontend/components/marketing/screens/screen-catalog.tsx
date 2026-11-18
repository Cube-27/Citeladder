import type { ComponentType } from 'react';

import type { PlatformScreen } from '@/lib/marketing-content/platform-pages';

import { ProductFrame, type FrameFit } from './product-frame';
import type { AppPageHead, NavLabel } from './screen-app';
import {
  ScreenActions,
  ScreenAgentBrief,
  ScreenAgentChat,
  ScreenCommerce,
  ScreenContentOptimization,
} from './screens-agent';
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
  'content-optimization': vignette(
    ScreenContentOptimization,
    'Content-gap Actions for acme.com: content pages to improve and pages to write, each with its lead angle',
  ),
  answer: vignette(ScreenAnswer, 'A ChatGPT answer that names Acme Analytics first'),
  sources: vignette(ScreenSources, 'Domains cited in answers about Acme Analytics'),
  'cited-url': vignette(ScreenCitedUrl, 'acme.com/pricing: which engines retrieve and cite it'),
  'site-health': vignette(ScreenSiteHealth, 'Site health for acme.com: score 82, 7 failed checks'),
  'crawler-access': vignette(ScreenCrawlerAccess, 'AI crawler access to acme.com from robots.txt'),
  demand: vignette(
    ScreenDemand,
    'Demand signals in Keyword research for acme.com: a query in striking distance, a CTR gap, two pages on one query and an emerging query',
  ),
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

/** Where a module's feature lives in the app: the page's head, or the Agent mode. */
type AppPlace = AppPageHead & Readonly<{ mode?: 'Agent' }>;

/**
 * Each module's focused screen and its place in the app, by platform route,
 * for module cards. A published module without one (Integrations, which has
 * its own section) is left out of the rail.
 */
type ModuleScreen = Readonly<{ screen: PlatformScreen; page: AppPlace }>;

/** A module shown on its own app page, whose title is the sidebar row it lights. */
const onPage = (
  screen: PlatformScreen,
  page: NavLabel,
  head: Omit<AppPageHead, 'title' | 'active'> = {},
): ModuleScreen => ({ screen, page: { title: page, active: page, ...head } });

/** The app's tabs for a page, with the module's tab open. */
const tab = (items: readonly string[], selected: string) => ({ tabs: { items, selected } });
const SOURCES_TABS = ['Domains', 'URLs', 'Read, not cited', 'Query fanouts', 'Ads'];
const KEYWORD_TABS = ['Demand', 'Overview', 'Keywords', 'Organic competitors', 'Backlinks'];
const SITE_TABS = [
  'Overview',
  'Pages',
  'Architecture',
  'AEO readiness',
  'Internal links',
  'Changes',
];
const TRAFFIC_TABS = ['Overview', 'Crawlers', 'Referrals', 'Pages', 'Activity'];
/** A module shown in the Agent workspace. */
const inAgent = (screen: PlatformScreen) => ({
  screen,
  page: { title: 'Agent', mode: 'Agent' as const },
});

export const MODULE_SCREENS = {
  '/platform/ai-visibility': onPage('engines', 'Insights'),
  '/platform/cited-sources': onPage('sources', 'Sources', {
    ...tab(SOURCES_TABS, 'Domains'),
    actions: 'launch',
  }),
  '/platform/ai-referral-analytics': onPage(
    'referrals',
    'AI traffic',
    tab(TRAFFIC_TABS, 'Referrals'),
  ),
  '/platform/product-visibility': onPage('commerce', 'Shopping'),
  '/platform/site-health': onPage('site-health', 'Site health', {
    ...tab(SITE_TABS, 'Overview'),
    actions: 'crawl',
  }),
  '/platform/search-demand': onPage('demand', 'Keyword research', {
    ...tab(KEYWORD_TABS, 'Demand'),
    actions: 'analysis',
  }),
  '/platform/keyword-research': onPage('keywords', 'Keyword research', {
    ...tab(KEYWORD_TABS, 'Keywords'),
    actions: 'analysis',
  }),
  // Content-gap work is listed in Actions (AS1).
  '/platform/content-optimization': onPage('content-optimization', 'Actions'),
  '/platform/agents': inAgent('agent-chat'),
  '/platform/mcp': inAgent('mcp'),
} satisfies Record<string, ModuleScreen>;

const MODULE_SCREEN_BY_HREF = new Map<string, ModuleScreen>(Object.entries(MODULE_SCREENS));

/** The module's card screen and app place, or nothing for a module without one. */
export function moduleScreen(href: string): ModuleScreen | undefined {
  return MODULE_SCREEN_BY_HREF.get(href);
}

/** One catalogue screen in its ProductFrame. */
export function CatalogFrame({ screen }: Readonly<{ screen: PlatformScreen }>) {
  const { View, label, fit } = SCREEN_CATALOG[screen];
  return (
    <ProductFrame label={label} fit={fit}>
      <View />
    </ProductFrame>
  );
}
