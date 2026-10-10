/** MCP's protocol surface. The API host serves all of it except browser consent. */

/** Browser-owned consent, served on the app origin only. */
export const MCP_CONSENT_PATH = '/mcp/oauth/consent';

/** Credential-free OAuth endpoints; browser-hosted clients call them from any origin. */
export const PUBLIC_OAUTH_PATHS: ReadonlySet<string> = new Set([
  '/mcp/register',
  '/authorize',
  '/token',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
]);

/** Every MCP path the API host serves: the transport plus the OAuth endpoints. */
export const MCP_API_HOST_PATHS: ReadonlySet<string> = new Set([
  '/mcp',
  '/mcp/',
  ...PUBLIC_OAUTH_PATHS,
]);

export function isMcpApiHostPath(path: string): boolean {
  return MCP_API_HOST_PATHS.has(path);
}
