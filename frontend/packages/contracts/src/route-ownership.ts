/**
 * The route-ownership manifest: which stack writes each `/api/v1` route
 * family (TypeScript migration rule 1).
 *
 * A family is one OpenAPI tag. Exactly one stack serves it: the PR that moves
 * a family to TypeScript flips its entry and deletes the Python router. The route-ownership gate
 * (`frontend/services/api/scripts/check-route-ownership.ts`) holds both
 * stacks' OpenAPI documents and both ingress Caddyfiles to this record.
 */
export type RouteStack = 'python' | 'typescript';

export const ROUTE_OWNERSHIP = {
  actions: 'typescript',
  agent: 'python',
  'ai-referrals': 'typescript',
  'audit-schedules': 'python',
  audits: 'python',
  auth: 'python',
  billing: 'python',
  'brand-identity': 'typescript',
  'brand-discoveries': 'python',
  commerce: 'typescript',
  'commerce-python': 'python',
  demand: 'typescript',
  executions: 'typescript',
  integrations: 'python',
  'mcp-connections': 'python',
  opportunities: 'typescript',
  performance: 'typescript',
  'performance-sync': 'python',
  readiness: 'python',
  projects: 'python',
  prompts: 'python',
  providers: 'python',
  'search-intelligence': 'typescript',
  'search-intelligence-reviews': 'python',
  'site-health': 'python',
  'site-health-internal-links': 'typescript',
  visibility: 'typescript',
  workspaces: 'python',
} as const satisfies Record<string, RouteStack>;

export type RouteFamily = keyof typeof ROUTE_OWNERSHIP;

/**
 * The ingress path patterns (Caddy `path` syntax, `*` within one segment)
 * that reach the TypeScript service. Every ingress Caddyfile names these
 * paths, which the route-ownership gate proves against both OpenAPI
 * documents; the development proxy reads this list directly.
 */
export const TYPESCRIPT_INGRESS_PATHS = [
  '/api/v1/projects/*/site-health/internal-links',
  '/api/v1/projects/*/site-health/internal-links/*',
  '/api/v1/projects/*/site-health/internal-links/analyses/*/cancel',
  '/api/v1/projects/*/commerce/catalog',
  '/api/v1/projects/*/commerce/catalog/import',
  '/api/v1/projects/*/commerce/competitors',
  '/api/v1/projects/*/commerce/competitors/discoveries',
  '/api/v1/projects/*/commerce/competitors/*-*-*-*-*',
  '/api/v1/projects/*/commerce/buyer-prompts',
  '/api/v1/projects/*/commerce/buyer-prompts/*-*-*-*-*',
  '/api/v1/projects/*/commerce/ai-shelf',
  '/api/v1/projects/*/brand-profile',
  '/api/v1/projects/*/business-map',
  '/api/v1/projects/*/competitor-suggestions',
  '/api/v1/projects/*/competitor-suggestions/*/accept',
  '/api/v1/projects/*/logo',
  '/api/v1/projects/*/competitors/*/logo',
  '/api/v1/executions/*',
  '/api/v1/projects/*/ai-referrals',
  '/api/v1/projects/*/performance',
  '/api/v1/projects/*/performance/table',
  '/api/v1/projects/*/performance/range',
  '/api/v1/projects/*/performance/range/*',
  '/api/v1/projects/*/demand/*',
  '/api/v1/projects/*/demand/query-evidence/summary',
  '/api/v1/projects/*/visibility',
  '/api/v1/projects/*/visibility/*',
  '/api/v1/projects/*/visibility/sources/*',
  '/api/v1/projects/*/opportunities',
  '/api/v1/projects/*/opportunities/*',
  '/api/v1/opportunities/*',
  '/api/v1/projects/*/actions',
  '/api/v1/actions/*',
  '/api/v1/projects/*/search-intelligence',
  '/api/v1/projects/*/search-intelligence/preferences',
  '/api/v1/projects/*/search-intelligence/runs',
  '/api/v1/projects/*/search-intelligence/runs/*',
  '/api/v1/projects/*/search-intelligence/runs/*/confirm',
  '/api/v1/projects/*/search-intelligence/runs/*/cancel',
  '/api/v1/projects/*/search-intelligence/datasets/*/rows',
  '/api/v1/projects/*/search-intelligence/content-handoff',
  '/api/v1/projects/*/search-intelligence/citation-matches',
] as const;
