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

/** MCP's browser consent, served on the app origin only. */
export const MCP_CONSENT_PATH = '/mcp/oauth/consent';

/** Credential-free OAuth endpoints; browser-hosted clients call them from any origin. */
export const MCP_PUBLIC_OAUTH_PATHS: ReadonlySet<string> = new Set([
  '/mcp/register',
  '/authorize',
  '/token',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
]);

/**
 * MCP's protocol surface on the API host: the transport plus its OAuth
 * endpoints. The API host Worker forwards exactly these and the API serves
 * them on that host alone.
 */
export const MCP_API_HOST_PATHS: ReadonlySet<string> = new Set([
  '/mcp',
  '/mcp/',
  ...MCP_PUBLIC_OAUTH_PATHS,
]);

/**
 * Same-origin paths the development proxy forwards, as the app Worker does:
 * the browser API and MCP consent. MCP itself is served on the API host.
 * `/x/*` forwards everything below `/x/`; any other entry matches only itself.
 */
export const TYPESCRIPT_INGRESS_PATHS = ['/api', '/api/*', MCP_CONSENT_PATH] as const;
