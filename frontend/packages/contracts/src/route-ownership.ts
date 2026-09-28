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
  'brand-discoveries': 'python',
  commerce: 'python',
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
  'search-intelligence': 'python',
  'site-health': 'python',
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
  '/api/v1/executions/*',
  '/api/v1/projects/*/ai-referrals',
  '/api/v1/projects/*/performance',
  '/api/v1/projects/*/performance/table',
  '/api/v1/projects/*/performance/range',
  '/api/v1/projects/*/performance/range/*',
  '/api/v1/projects/*/demand/*',
  '/api/v1/projects/*/demand/query-evidence/summary',
  '/api/v1/projects/*/visibility/sources/series',
  '/api/v1/projects/*/visibility/sources/url',
  '/api/v1/projects/*/visibility/surface-rates',
  '/api/v1/projects/*/opportunities',
  '/api/v1/projects/*/opportunities/*',
  '/api/v1/opportunities/*',
  '/api/v1/projects/*/actions',
  '/api/v1/actions/*',
] as const;
