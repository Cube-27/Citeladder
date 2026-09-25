/**
 * React Query key namespaces (F2).
 *
 * All ids are string UUIDs (workspace-scoped contract). One namespace per API
 * domain owner, each defined in its own module under `query-keys/`:
 *   - core.ts          — auth, workspaces, projects, prompts, providers
 *   - runs.ts          — runs (audits + executions), visibility, cited pages
 *   - site-health.ts   — site health (crawls, inventory, monitored, issues)
 *   - integrations.ts  — integrations (connections, sync runs)
 *   - performance.ts   — performance (dashboard, dimension tables, range task)
 *   - demand.ts        — search-demand projections
 *   - ai-referrals.ts  — AI-referral measurements
 *   - opportunities.ts — opportunities (catalog, detail, summary)
 *   - commerce.ts      — commerce (catalog feed health, agentic product visibility)
 *
 * This facade assembles them under one `queryKeys` entry point.
 */
import { aiReferralsKeys } from './query-keys/ai-referrals';
import { billingKeys } from './query-keys/billing';
import { brandDiscoveryKeys } from './query-keys/brand-discovery';
import { commerceKeys } from './query-keys/commerce';
import { demandKeys } from './query-keys/demand';
import { searchIntelligenceKeys } from './query-keys/search-intelligence';
import {
  authKeys,
  projectKeys,
  promptKeys,
  providerKeys,
  topicKeys,
  workspaceKeys,
} from './query-keys/core';
import { integrationKeys } from './query-keys/integrations';
import { opportunityKeys } from './query-keys/opportunities';
import { runKeys, visibilityKeys } from './query-keys/runs';
import { siteHealthKeys } from './query-keys/site-health';
import { performanceKeys } from './query-keys/performance';

export const queryKeys = {
  auth: authKeys,
  billing: billingKeys,
  brandDiscovery: brandDiscoveryKeys,
  workspaces: workspaceKeys,
  projects: projectKeys,
  prompts: promptKeys,
  topics: topicKeys,
  providers: providerKeys,
  runs: runKeys,
  visibility: visibilityKeys,
  siteHealth: siteHealthKeys,
  integrations: integrationKeys,
  performance: performanceKeys,
  demand: demandKeys,
  searchIntelligence: searchIntelligenceKeys,
  aiReferrals: aiReferralsKeys,
  opportunities: opportunityKeys,
  commerce: commerceKeys,
} as const;
