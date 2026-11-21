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
  'client-errors',
  'commerce',
  'demand',
  'executions',
  'integrations',
  'mcp-connections',
  'opportunities',
  'performance',
  'performance-sync',
  'probes',
  'readiness',
  'projects',
  'overview',
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

export const MCP_CONSENT_PATH = '/mcp/oauth/consent';

export const MCP_PUBLIC_OAUTH_PATHS: ReadonlySet<string> = new Set([
  '/mcp/register',
  '/authorize',
  '/token',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
]);

export const MCP_API_HOST_PATHS: ReadonlySet<string> = new Set([
  '/mcp',
  '/mcp/',
  ...MCP_PUBLIC_OAUTH_PATHS,
]);

export const TYPESCRIPT_INGRESS_PATHS = ['/api', '/api/*', MCP_CONSENT_PATH] as const;

export function isIngressPath(path: string): boolean {
  return TYPESCRIPT_INGRESS_PATHS.some((entry) =>
    entry.endsWith('/*') ? path.startsWith(entry.slice(0, -1)) : path === entry,
  );
}

export const CREDENTIAL_LINK_PATHS: ReadonlySet<string> = new Set([
  '/verify-email',
  '/reset-password',
  '/invitations/accept',
]);

export const CSP_REPORTS_PATH = '/api/v1/client-errors/csp-reports';
