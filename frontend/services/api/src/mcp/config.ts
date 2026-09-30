import { ConfigError, demoAccessExpired, policy, resolveSettingSpec, type ServiceConfig } from '../config.ts';

export const mcpPolicy = policy.mcp.constants;
export function loadMcpConfig(config: ServiceConfig, env: Record<string, string | undefined> = process.env) {
  const value = (name: keyof typeof policy.mcp.settings) => resolveSettingSpec(policy.mcp.settings[name], env);
  let browserOrigin = String(resolveSettingSpec(policy.settings.frontend_url, env)).replace(/\/$/u, '');
  const enabled = value('enabled') as boolean;
  const configured = String(value('public_base_url')).trim();
  let origin = (configured || browserOrigin).replace(/\/$/u, '');
  const allowedEmail = String(value('allowed_account_email')).trim().toLowerCase();
  if (enabled) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new ConfigError('MCP_PUBLIC_BASE_URL must be an HTTP(S) origin'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new ConfigError('MCP_PUBLIC_BASE_URL must be an HTTP(S) origin');
    origin = parsed.origin;
    const browser = new URL(browserOrigin);
    if (!['http:', 'https:'].includes(browser.protocol) || browser.username || browser.password || browser.search || browser.hash || browser.pathname !== '/') throw new ConfigError('FRONTEND_URL must be an HTTP(S) origin for MCP consent');
    browserOrigin = browser.origin;
    if (config.appEnv.toLowerCase() === 'production' && (!configured || parsed.protocol !== 'https:')) throw new ConfigError('MCP_PUBLIC_BASE_URL must be configured with HTTPS in production');
    if (config.demo.enabled && allowedEmail !== String(resolveSettingSpec(policy.settings.dev_login_email, env)).trim().toLowerCase()) throw new ConfigError('Demo MCP access must be restricted to the provisioned dev account');
  }
  return { enabled, origin, browserOrigin, allowedEmail,
    encryptionKey: String(resolveSettingSpec(policy.settings.encryption_key, env)),
    requestTtl: value('authorization_request_ttl_seconds') as number,
    codeTtl: value('authorization_code_ttl_seconds') as number,
    accessTtl: value('access_token_ttl_seconds') as number,
    refreshTtl: value('refresh_token_ttl_seconds') as number,
    unusedClientTtl: value('unused_client_ttl_seconds') as number };
}
export type McpConfig = ReturnType<typeof loadMcpConfig>;
export function accountAllowed(config: ServiceConfig, mcp: McpConfig, email: string): boolean {
  return mcp.enabled && !demoAccessExpired(config) && (!config.demo.enabled || !!mcp.allowedEmail) && (!mcp.allowedEmail || email.toLowerCase() === mcp.allowedEmail);
}
