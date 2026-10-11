import { resolveSettingSpec } from '../config.ts';
import { providerPolicy, type ProviderTransport } from './config.ts';

/**
 * The platform's secret for a platform connection's credential `reference`,
 * read from the environment only while the reference still names it; `null`
 * when it is unset or no longer matches. DataForSEO's is its login pair as JSON.
 */
export function platformSecret(
  transport: ProviderTransport,
  reference: string,
  env: Record<string, string | undefined>,
): string | null {
  if (transport === 'dataforseo') {
    const spec = providerPolicy.platform_dataforseo;
    if (
      !reference ||
      reference !== String(resolveSettingSpec(spec.platform_credential_ref, env)).trim()
    )
      return null;
    const login = String(resolveSettingSpec(spec.api_login, env)).trim();
    const password = String(resolveSettingSpec(spec.api_password, env));
    return login && password ? JSON.stringify({ login, password }) : null;
  }
  const spec = providerPolicy.platform_credentials[transport];
  const secret = String(resolveSettingSpec(spec.secret, env));
  if (!reference || reference !== String(resolveSettingSpec(spec.reference, env)).trim() || !secret)
    return null;
  return secret;
}
