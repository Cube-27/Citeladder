import { actionKeys } from './query-keys/actions';
import { agentKeys } from './query-keys/agent';
import { aiTrafficKeys } from './query-keys/ai-traffic';
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
  policyKeys,
  mcpConnectionKeys,
  apiKeyKeys,
} from './query-keys/core';
import { integrationKeys } from './query-keys/integrations';
import { runKeys, visibilityKeys } from './query-keys/runs';
import { siteHealthKeys } from './query-keys/site-health';
import { performanceKeys } from './query-keys/performance';

export const queryKeys = {
  auth: authKeys,
  policies: policyKeys,
  mcpConnections: mcpConnectionKeys,
  apiKeys: apiKeyKeys,
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
  aiTraffic: aiTrafficKeys,
  actions: actionKeys,
  agent: agentKeys,
  commerce: commerceKeys,
} as const;
