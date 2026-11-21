import {
  ConfigError,
  demoAccessExpired,
  policy,
  secretIsWeak,
  type ServiceConfig,
} from '../config.ts';
import { resolveSettingSpec, type SettingSource } from '../config/settings.ts';

export const mcpPolicy = policy.mcp.constants;
/**
 * The supported scopes a request names, in policy order, with read always
 * included; unknown extras such as `offline_access` narrow away (RFC 6749
 * §3.3). A request naming no scope may receive every supported one.
 */
export const holdsWrite = (scopes: readonly string[]) => scopes.includes(mcpPolicy.write_scope);

export function grantableScopes(requested: string | null | undefined): string[] {
  const named = (requested ?? '').split(/\s+/u).filter(Boolean);
  return mcpPolicy.scopes_supported.filter(
    (scope) => !named.length || scope === mcpPolicy.read_scope || named.includes(scope),
  );
}
const isBareHttpOrigin = (url: URL) =>
  ['http:', 'https:'].includes(url.protocol) &&
  !url.username &&
  !url.password &&
  !url.search &&
  !url.hash &&
  url.pathname === '/';
function assertEncryptionKey(config: ServiceConfig, encryptionKey: string) {
  if (
    !policy.development_env_names.includes(config.appEnv.trim().toLowerCase()) &&
    (secretIsWeak(encryptionKey) || encryptionKey === config.session.secretKey)
  )
    throw new ConfigError(
      'ENCRYPTION_KEY must meet the production strength policy and be independent of JWT_SECRET_KEY',
    );
}
export function loadMcpConfig(config: ServiceConfig, source: SettingSource = config.settings) {
  const value = <K extends keyof typeof policy.mcp.settings>(name: K) =>
    resolveSettingSpec(policy.mcp.settings[name], source);
  let browserOrigin = String(resolveSettingSpec(policy.settings.frontend_url, source)).replace(
    /\/$/u,
    '',
  );
  const enabled = value('enabled');
  const configured = config.auth.publicApiUrl.trim();
  let origin = configured.replace(/\/$/u, '');
  const allowedEmail = String(value('allowed_account_email')).trim().toLowerCase();
  const encryptionKey = String(resolveSettingSpec(policy.settings.encryption_key, source));
  if (enabled) {
    assertEncryptionKey(config, encryptionKey);
    if (!configured) throw new ConfigError('PUBLIC_API_URL must be configured for MCP');
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ConfigError('PUBLIC_API_URL must be an HTTP(S) origin');
    }
    if (!isBareHttpOrigin(parsed))
      throw new ConfigError('PUBLIC_API_URL must be an HTTP(S) origin');
    origin = parsed.origin;
    const browser = new URL(browserOrigin);
    if (!isBareHttpOrigin(browser))
      throw new ConfigError('FRONTEND_URL must be an HTTP(S) origin for MCP consent');
    browserOrigin = browser.origin;
    if (config.appEnv.trim().toLowerCase() === 'production' && parsed.protocol !== 'https:')
      throw new ConfigError('PUBLIC_API_URL must use HTTPS in production');
    if (
      config.demo.enabled &&
      allowedEmail !==
        String(resolveSettingSpec(policy.settings.dev_login_email, source)).trim().toLowerCase()
    )
      throw new ConfigError('Demo MCP access must be restricted to the provisioned dev account');
  }
  return {
    enabled,
    origin,
    browserOrigin,
    allowedEmail,
    encryptionKey,
    requestTtl: value('authorization_request_ttl_seconds'),
    codeTtl: value('authorization_code_ttl_seconds'),
    accessTtl: value('access_token_ttl_seconds'),
    refreshTtl: value('refresh_token_ttl_seconds'),
    unusedClientTtl: value('unused_client_ttl_seconds'),
  };
}
export type McpConfig = ReturnType<typeof loadMcpConfig>;
export function accountAllowed(config: ServiceConfig, mcp: McpConfig, email: string): boolean {
  return (
    mcp.enabled &&
    !demoAccessExpired(config) &&
    (!config.demo.enabled || !!mcp.allowedEmail) &&
    (!mcp.allowedEmail || email.toLowerCase() === mcp.allowedEmail)
  );
}
