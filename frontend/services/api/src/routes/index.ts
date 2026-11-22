import { aiTrafficRoutes } from './ai-traffic.ts';
import { crawlLogRoutes } from './crawl-logs.ts';
import type { ProductRoute } from './define.ts';
import { executionRoutes } from './executions.ts';
import { visibilityRoutes } from './visibility.ts';
import { performanceRoutes } from './performance.ts';
import { demandRoutes } from './demand.ts';
import { opportunityRoutes } from './opportunities.ts';
import { actionRoutes } from './actions.ts';
import { searchIntelligenceRoutes } from './search-intelligence.ts';
import { commerceRoutes } from './commerce.ts';
import { brandIdentityRoutes } from './brand-identity.ts';
import { probeRoutes } from './probes.ts';
import { promptRoutes } from './prompts.ts';
import { internalLinkRoutes } from './internal-links.ts';
import { siteHealthRoutes } from './site-health.ts';
import { siteHealthCrawlRoutes } from './site-health-crawls.ts';
import { projectRoutes } from './projects.ts';
import { brandDiscoveryRoutes } from './brand-discoveries.ts';
import { integrationRoutes } from './integrations.ts';
import { authRoutes } from './auth.ts';
import { workspaceRoutes } from './workspaces.ts';
import { MCP_CONNECTION_ROUTES } from './mcp-connections.ts';
import { API_KEY_ROUTES } from './api-keys.ts';
import { publicApiRoutes } from '../public-api/routes.ts';
import { billingDocumentRoutes } from './billing-documents.ts';
import { overviewRoutes } from './overview.ts';
import { billingRoutes } from './billing.ts';
import { auditScheduleRoutes } from './audit-schedules.ts';
import { auditRoutes } from './audits.ts';
import { providerRoutes } from './providers.ts';
import { agentRoutes } from './agent.ts';
import { agentProposalRoutes } from './agent-proposals.ts';
import { clientErrorRoutes } from './client-errors.ts';

export const ROUTE_MODULES: Readonly<Record<string, readonly ProductRoute[]>> = {
  'routes/agent.ts': agentRoutes,
  'routes/agent-proposals.ts': agentProposalRoutes,
  'routes/providers.ts': providerRoutes,
  'routes/mcp-connections.ts': MCP_CONNECTION_ROUTES,
  'routes/api-keys.ts': API_KEY_ROUTES,
  'routes/billing.ts': billingRoutes,
  'routes/projects.ts': projectRoutes,
  'routes/brand-discoveries.ts': brandDiscoveryRoutes,
  'routes/auth.ts': authRoutes,
  'routes/client-errors.ts': clientErrorRoutes,
  'routes/workspaces.ts': workspaceRoutes,
  'routes/billing-documents.ts': billingDocumentRoutes,
  'routes/overview.ts': overviewRoutes,
  'routes/internal-links.ts': internalLinkRoutes,
  'routes/site-health.ts': siteHealthRoutes,
  'routes/site-health-crawls.ts': siteHealthCrawlRoutes,
  'routes/executions.ts': executionRoutes,
  'routes/ai-traffic.ts': aiTrafficRoutes,
  'routes/crawl-logs.ts': crawlLogRoutes,
  'routes/visibility.ts': visibilityRoutes,
  'routes/performance.ts': performanceRoutes,
  'routes/demand.ts': demandRoutes,
  'routes/opportunities.ts': opportunityRoutes,
  'routes/actions.ts': actionRoutes,
  'routes/search-intelligence.ts': searchIntelligenceRoutes,
  'routes/commerce.ts': commerceRoutes,
  'routes/brand-identity.ts': brandIdentityRoutes,
  'routes/probes.ts': probeRoutes,
  'routes/prompts.ts': promptRoutes,
  'routes/integrations.ts': integrationRoutes,
  'routes/audit-schedules.ts': auditScheduleRoutes,
  'routes/audits.ts': auditRoutes,
  'public-api/routes.ts': publicApiRoutes,
};

export const PRODUCT_ROUTES: readonly ProductRoute[] = Object.values(ROUTE_MODULES).flat();
