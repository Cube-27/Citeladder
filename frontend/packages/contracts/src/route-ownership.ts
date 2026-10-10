/** Native API families; the route gate checks every operation declares one. */
export type RouteStack = 'typescript';

export const ROUTE_OWNERSHIP = {
  actions: 'typescript',
  agent: 'typescript',
  'ai-traffic': 'typescript',
  'crawl-logs': 'typescript',
  'crawl-log-ingest': 'typescript',
  'audit-schedules': 'typescript',
  audits: 'typescript',
  auth: 'typescript',
  billing: 'typescript',
  'billing-documents': 'typescript',
  'brand-identity': 'typescript',
  'brand-discoveries': 'typescript',
  commerce: 'typescript',
  demand: 'typescript',
  executions: 'typescript',
  integrations: 'typescript',
  'mcp-connections': 'typescript',
  opportunities: 'typescript',
  performance: 'typescript',
  'performance-sync': 'typescript',
  readiness: 'typescript',
  projects: 'typescript',
  'executive-report': 'typescript',
  'prompt-generation': 'typescript',
  prompts: 'typescript',
  providers: 'typescript',
  'api-keys': 'typescript',
  'public-api': 'typescript',
  'search-intelligence': 'typescript',
  'search-intelligence-reviews': 'typescript',
  'site-health': 'typescript',
  'site-health-crawls': 'typescript',
  'site-health-internal-links': 'typescript',
  visibility: 'typescript',
  workspaces: 'typescript',
} as const satisfies Record<string, RouteStack>;

export type RouteFamily = keyof typeof ROUTE_OWNERSHIP;

/**
 * Same-origin API and protocol paths the development proxy forwards. `/x/*`
 * forwards everything below `/x/`; any other entry matches only itself.
 */
export const TYPESCRIPT_INGRESS_PATHS = [
  '/api',
  '/api/*',
  '/mcp',
  '/mcp/*',
  '/authorize',
  '/token',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
] as const;
