import type { Selectable } from 'kysely';
import { resolveSettingSpec } from '../config.ts';
import type { ProviderConnections } from '../generated/db-schema.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { providerPolicy, type ProviderTransport } from './config.ts';
import { ProviderError } from './errors.ts';

type SecretConnection = Pick<
  Selectable<ProviderConnections>,
  'credential_source' | 'transport_provider' | 'platform_credential_ref' | 'api_key_encrypted'
>;

/**
 * The connection's execution secret: the platform's for a platform connection,
 * the decrypted key for a BYOK one. Refused as an auth failure when unreadable.
 * It lives only in the caller's detached context, never in snapshots or logs.
 */
export function connectionSecret(
  connection: SecretConnection,
  encryptionKey: string,
  env: Record<string, string | undefined> = process.env,
): string {
  let secret: string | null;
  try {
    secret =
      connection.credential_source === 'platform'
        ? platformSecret(
            connection.transport_provider as ProviderTransport,
            connection.platform_credential_ref,
            env,
          )
        : createSecretCipher(encryptionKey).decrypt(connection.api_key_encrypted);
  } catch {
    secret = null;
  }
  if (secret === null) throw new ProviderError('auth_failure');
  return secret;
}

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
