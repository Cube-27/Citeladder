import type { Selectable } from 'kysely';
import { resolveSettingSpec, type SettingSource } from '../config/settings.ts';
import type { ProviderConnections } from '../generated/db-schema.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { providerPolicy, type ProviderTransport } from './config.ts';
import { ProviderError } from './errors.ts';

type SecretConnection = Pick<
  Selectable<ProviderConnections>,
  'credential_source' | 'transport_provider' | 'platform_credential_ref' | 'api_key_encrypted'
>;

export function connectionSecret(
  connection: SecretConnection,
  encryptionKey: string,
  env: SettingSource = process.env,
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

function platformSecret(
  transport: ProviderTransport,
  reference: string,
  env: SettingSource,
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
