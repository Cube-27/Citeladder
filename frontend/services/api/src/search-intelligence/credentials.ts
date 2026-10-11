/**
 * Which DataForSEO account a Search Intelligence analysis runs on (B40): a
 * managed workspace researches on the platform's account and pays in AI
 * credits; a BYOK workspace uses its own connection and is not charged.
 */
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import type { Selectable } from 'kysely';

import { ProviderError } from '../answer-engines/contracts.ts';
import type { CredentialMode } from '../billing/credential-mode.ts';
import type { Database } from '../db/database.ts';
import type { WorkspaceScope } from '../db/workspace-scope.ts';
import { ApiError } from '../errors.ts';
import type { ProviderConnections, SearchIntelligenceRuns } from '../generated/db-schema.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { onlyOf } from '../lists.ts';
import { dataforseoSecretIdentity } from '../providers/dataforseo-identity.ts';
import { platformSecret } from '../providers/platform-secrets.ts';
import { si } from './requests.ts';

type Connection = Selectable<ProviderConnections>;
type Run = Selectable<SearchIntelligenceRuns>;
export type CredentialSource = 'byok' | 'platform';

/** The workspace's own DataForSEO connections a review may use: active, tested ok and keyed. */
export function workspaceConnections(db: Database, workspace: WorkspaceScope) {
  return workspace
    .selectFrom(db, 'provider_connections')
    .selectAll()
    .where('transport_provider', '=', si.transport_provider)
    .where('credential_source', '=', 'byok')
    .where('active', '=', true)
    .where('last_test_status', '=', si.connection_test_ok)
    .where('api_key_encrypted', '!=', '')
    .orderBy('created_at')
    .execute();
}

/** The platform's DataForSEO connection, when one is configured, tested and unpaused. */
export function platformConnection(db: Database, at = new Date()) {
  return db
    .selectFrom('provider_connections as c')
    .innerJoin('workspaces as w', 'w.id', 'c.workspace_id')
    .selectAll('c')
    .where('w.is_system', '=', true)
    .where('c.credential_source', '=', 'platform')
    .where('c.transport_provider', '=', si.transport_provider)
    .where('c.active', '=', true)
    .where('c.last_test_status', '=', si.connection_test_ok)
    .where('c.platform_credential_ref', '!=', '')
    .where((eb) => eb.or([eb('c.paused_at', 'is', null), eb('c.pause_until', '<=', at)]))
    .orderBy('c.created_at')
    .orderBy('c.id')
    .executeTakeFirst();
}

/** The connection a new review freezes, by the workspace's plan; refused when none is usable. */
export async function reviewConnection(
  db: Database,
  workspace: WorkspaceScope,
  mode: CredentialMode,
  connectionId: string | null,
): Promise<{ connection: Connection; source: CredentialSource }> {
  if (mode === 'funded') {
    const connection = await platformConnection(db);
    if (!connection)
      throw new ApiError(422, 'Search Intelligence is unavailable right now', {
        code: asApiErrorCode('dataforseo_connection_required'),
      });
    return { connection, source: 'platform' };
  }
  const eligible = (await workspaceConnections(db, workspace)).filter(
    (item) => !connectionId || item.id === connectionId,
  );
  const connection = onlyOf(eligible);
  if (!connection)
    throw new ApiError(422, 'Select one eligible DataForSEO connection', {
      code: asApiErrorCode(
        eligible.length ? 'dataforseo_connection_ambiguous' : 'dataforseo_connection_required',
      ),
    });
  return { connection, source: 'byok' };
}

/** The run's frozen connection while it is still the one reviewed; undefined once it changed. */
export function runConnection(db: Database, run: Run) {
  return db
    .selectFrom('provider_connections as c')
    .innerJoin('workspaces as w', 'w.id', 'c.workspace_id')
    .selectAll('c')
    .where('c.id', '=', run.connection_id)
    .where('c.transport_provider', '=', si.transport_provider)
    .where('c.credential_source', '=', run.credential_source)
    .where('c.active', '=', true)
    .where('c.credential_revision', '=', run.connection_revision)
    .$if(run.credential_source === 'byok', (query) =>
      query.where('c.workspace_id', '=', run.workspace_id),
    )
    .$if(run.credential_source === 'platform', (query) =>
      query
        .where('w.is_system', '=', true)
        // A paused platform connection sends nothing until its pause ends.
        .where((eb) =>
          eb.or([eb('c.paused_at', 'is', null), eb('c.pause_until', '<=', new Date())]),
        ),
    )
    .executeTakeFirst();
}

/** The connection's DataForSEO login pair as JSON; refused as an auth failure when unreadable. */
export function connectionSecret(
  connection: Connection,
  encryptionKey: string,
  env: Record<string, string | undefined> = process.env,
) {
  let secret: string | null;
  try {
    secret =
      connection.credential_source === 'platform'
        ? platformSecret('dataforseo', connection.platform_credential_ref, env)
        : createSecretCipher(encryptionKey).decrypt(connection.api_key_encrypted);
  } catch {
    secret = null;
  }
  if (secret === null) throw new ProviderError('auth_failure');
  return secret;
}

/** The quota-pool identity of the connection's DataForSEO account. */
export function connectionIdentity(
  connection: Connection,
  encryptionKey: string,
  env?: Record<string, string | undefined>,
) {
  return dataforseoSecretIdentity(connectionSecret(connection, encryptionKey, env), encryptionKey);
}
