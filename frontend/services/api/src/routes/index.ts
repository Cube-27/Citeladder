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

export const PRODUCT_ROUTES: readonly ProductRoute[] = [
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
];
