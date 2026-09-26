/**
 * The route-ownership manifest: which stack writes each `/api/v1` route
 * family (TypeScript migration rule 1).
 *
 * A family is one OpenAPI tag. Exactly one stack serves it: the PR that moves
 * a family to TypeScript flips its entry, freezes the Python fragment and
 * deletes the Python router. The route-ownership gate
 * (`frontend/services/api/scripts/check-route-ownership.ts`) holds both
 * stacks' OpenAPI documents and both ingress Caddyfiles to this record.
 */
export type RouteStack = 'python' | 'typescript';

export const ROUTE_OWNERSHIP = {
  agent: 'python',
  'ai-referrals': 'python',
  'audit-schedules': 'python',
  audits: 'python',
  auth: 'python',
  billing: 'python',
  'brand-discoveries': 'python',
  commerce: 'python',
  demand: 'python',
  executions: 'python',
  integrations: 'python',
  'mcp-connections': 'python',
  opportunities: 'python',
  performance: 'python',
  projects: 'python',
  prompts: 'python',
  providers: 'python',
  'search-intelligence': 'python',
  'site-health': 'python',
  visibility: 'python',
  workspaces: 'python',
} as const satisfies Record<string, RouteStack>;

export type RouteFamily = keyof typeof ROUTE_OWNERSHIP;
