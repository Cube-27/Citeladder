import type { ComponentType } from 'react';

import type { PlatformScreen } from '@/lib/marketing-content/platform-pages';

import {
  ArtAnswer,
  ArtCommerce,
  ArtReferrals,
  ArtSources,
  ArtVisibility,
} from '../art/art-visibility';
import {
  ArtAgent,
  ArtContent,
  ArtDemand,
  ArtKeywords,
  ArtMcp,
  ArtSiteHealth,
} from '../art/art-work';

import { ProductFrame } from './product-frame';
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

type CatalogEntry = Readonly<
  | { fit: 'scale'; View: ComponentType; label: string }
  | { fit: 'fluid'; View: ComponentType; Art: ComponentType; label: string }
>;

const vignette = (View: ComponentType, Art: ComponentType, label: string): CatalogEntry => ({
  View,
  Art,
  fit: 'fluid',
  label,
});

export const SCREEN_CATALOG: Readonly<Record<PlatformScreen, CatalogEntry>> = {
  visibility: {
    View: ScreenVisibility,
    fit: 'scale',
    label: 'The Visibility page for Acme Analytics',
  },
  prompts: vignette(ScreenPrompts, ArtKeywords, 'The tracked prompts for Acme Analytics'),
  keywords: vignette(ScreenKeywords, ArtKeywords, 'Keyword research for acme.com'),
  actions: vignette(ScreenActions, ArtContent, 'Actions for acme.com, highest priority first'),
  'content-optimization': vignette(
    ScreenContentOptimization,
    ArtContent,
    'Content-gap Actions for acme.com: content pages to improve and pages to write, each with its lead angle',
  ),
  answer: vignette(ScreenAnswer, ArtAnswer, 'A ChatGPT answer that names Acme Analytics first'),
  sources: vignette(ScreenSources, ArtSources, 'Domains cited in answers about Acme Analytics'),
  'cited-url': vignette(
    ScreenCitedUrl,
    ArtSources,
    'acme.com/pricing: which engines retrieve and cite it',
  ),
  'site-health': vignette(
    ScreenSiteHealth,
    ArtSiteHealth,
    'Site health for acme.com: score 82, 7 failed checks',
  ),
  'crawler-access': vignette(
    ScreenCrawlerAccess,
    ArtSiteHealth,
    'AI crawler access to acme.com from robots.txt',
  ),
  demand: vignette(
    ScreenDemand,
    ArtDemand,
    'Demand signals in Keyword research for acme.com: a query in striking distance, a CTR gap, two pages on one query and an emerging query',
  ),
  referrals: vignette(
    ScreenReferrals,
    ArtReferrals,
    'Sessions referred to acme.com by AI assistants',
  ),
  perception: vignette(ScreenPerception, ArtAnswer, 'How AI engines describe Acme Analytics'),
  engines: vignette(ScreenEngines, ArtVisibility, 'Acme Analytics visibility on each engine'),
  'agent-chat': vignette(
    ScreenAgentChat,
    ArtAgent,
    'The Agent answering why Acme dropped on Gemini',
  ),
  'agent-brief': vignette(
    ScreenAgentBrief,
    ArtContent,
    'A content brief the Agent drafted for a session replay pricing page',
  ),
  mcp: vignette(
    ScreenMcp,
    ArtMcp,
    'Read-only tool calls an assistant made to the CiteLadder MCP server',
  ),
  integrations: vignette(ScreenIntegrations, ArtReferrals, 'Data sources connected to acme.com'),
  commerce: vignette(
    ScreenCommerce,
    ArtCommerce,
    'Which products AI answers recommended for Acme Startup',
  ),
};

type AppPlace = AppPageHead & Readonly<{ mode?: 'Agent' }>;

type ModuleScreen = Readonly<{ screen: PlatformScreen; page: AppPlace }>;

const onPage = (
  screen: PlatformScreen,
  page: NavLabel,
  head: Omit<AppPageHead, 'title' | 'active'> = {},
): ModuleScreen => ({ screen, page: { title: page, active: page, ...head } });

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
  '/platform/content-optimization': onPage('content-optimization', 'Actions'),
  '/platform/agents': inAgent('agent-chat'),
  '/platform/mcp': inAgent('mcp'),
} satisfies Record<string, ModuleScreen>;

const MODULE_SCREEN_BY_HREF = new Map<string, ModuleScreen>(Object.entries(MODULE_SCREENS));

export function moduleScreen(href: string): ModuleScreen | undefined {
  return MODULE_SCREEN_BY_HREF.get(href);
}

export function CatalogFrame({ screen }: Readonly<{ screen: PlatformScreen }>) {
  const entry = SCREEN_CATALOG[screen];
  if (entry.fit === 'fluid') {
    return (
      <ProductFrame label={entry.label} stage="soft">
        <entry.Art />
      </ProductFrame>
    );
  }
  return (
    <ProductFrame label={entry.label} fit={entry.fit}>
      <entry.View />
    </ProductFrame>
  );
}
