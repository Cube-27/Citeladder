/** Every product route the TypeScript service serves, by family. */
import { aiReferralRoutes } from './ai-referrals.ts';
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
import { promptRoutes } from './prompts.ts';
import { internalLinkRoutes } from './internal-links.ts';
import { projectRoutes } from './projects.ts';
import { brandDiscoveryRoutes } from './brand-discoveries.ts';
import { integrationRoutes } from './integrations.ts';
import { authRoutes } from './auth.ts';
import { workspaceRoutes } from './workspaces.ts';
import { MCP_CONNECTION_ROUTES } from './mcp-connections.ts';
import { billingDocumentRoutes } from './billing-documents.ts';
import { billingRoutes } from './billing.ts';
import { auditScheduleRoutes } from './audit-schedules.ts';

export const PRODUCT_ROUTES: readonly ProductRoute[] = [
  ...MCP_CONNECTION_ROUTES,
  ...billingRoutes,
  ...projectRoutes,
  ...brandDiscoveryRoutes,
  ...authRoutes,
  ...workspaceRoutes,
  ...billingDocumentRoutes,
  ...internalLinkRoutes,
  ...executionRoutes,
  ...aiReferralRoutes,
  ...visibilityRoutes,
  ...performanceRoutes,
  ...demandRoutes,
  ...opportunityRoutes,
  ...actionRoutes,
  ...searchIntelligenceRoutes,
  ...commerceRoutes,
  ...brandIdentityRoutes,
  ...promptRoutes,
  ...integrationRoutes,
  ...auditScheduleRoutes,
];
