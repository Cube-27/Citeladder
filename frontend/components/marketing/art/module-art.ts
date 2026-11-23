import type { ComponentType } from 'react';

import type { MODULE_SCREENS } from '../screens/screen-catalog';

import { ArtCommerce, ArtReferrals, ArtSources, ArtVisibility } from './art-visibility';
import { ArtAgent, ArtContent, ArtDemand, ArtKeywords, ArtMcp, ArtSiteHealth } from './art-work';

const MODULE_ART = {
  '/platform/ai-visibility': ArtVisibility,
  '/platform/cited-sources': ArtSources,
  '/platform/ai-referral-analytics': ArtReferrals,
  '/platform/product-visibility': ArtCommerce,
  '/platform/site-health': ArtSiteHealth,
  '/platform/search-demand': ArtDemand,
  '/platform/keyword-research': ArtKeywords,
  '/platform/content-optimization': ArtContent,
  '/platform/agents': ArtAgent,
  '/platform/mcp': ArtMcp,
} satisfies Record<keyof typeof MODULE_SCREENS, ComponentType>;

const MODULE_ART_BY_HREF = new Map<string, ComponentType>(Object.entries(MODULE_ART));

export function moduleArt(href: string): ComponentType | undefined {
  return MODULE_ART_BY_HREF.get(href);
}
