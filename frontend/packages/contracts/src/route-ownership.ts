/** The API's route families; the route gate checks every operation declares exactly one. */
export const ROUTE_FAMILIES = [
  'actions',
  'agent',
  'ai-traffic',
  'crawl-logs',
  'crawl-log-ingest',
  'audit-schedules',
  'audits',
  'auth',
  'billing',
  'billing-documents',
  'brand-identity',
  'brand-discoveries',
  'commerce',
  'demand',
  'executions',
  'integrations',
  'mcp-connections',
  'opportunities',
  'performance',
  'performance-sync',
  'readiness',
  'projects',
  'executive-report',
  'prompt-generation',
  'prompts',
  'providers',
  'api-keys',
  'public-api',
  'search-intelligence',
  'search-intelligence-reviews',
  'site-health',
  'site-health-crawls',
  'site-health-internal-links',
  'visibility',
  'workspaces',
] as const;

export type RouteFamily = (typeof ROUTE_FAMILIES)[number];

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
