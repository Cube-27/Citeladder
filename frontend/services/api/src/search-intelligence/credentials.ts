import type { CredentialMode } from '@citeladder/contracts/billing';
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import type { Selectable } from 'kysely';

import type { Database } from '../db/database.ts';
import type { WorkspaceScope } from '../db/workspace-scope.ts';
import { ApiError } from '../errors.ts';
import type { ProviderConnections, SearchIntelligenceRuns } from '../generated/db-schema.ts';
import { onlyOf } from '../lists.ts';
import { providers } from '../config/providers.ts';
import { si } from './requests.ts';

type Connection = Selectable<ProviderConnections>;
type Run = Selectable<SearchIntelligenceRuns>;
export type CredentialSource = 'byok' | 'platform';

export function workspaceConnections(db: Database, workspace: WorkspaceScope) {
  return workspace
    .selectFrom(db, 'provider_connections')
    .selectAll()
    .where('transport_provider', '=', si.transport_provider)
    .where('credential_source', '=', 'byok')
    .where('active', '=', true)
    .where('last_test_status', '=', providers.test_status_ok)
    .where('api_key_encrypted', '!=', '')
    .orderBy('created_at')
    .execute();
}

export function platformConnection(db: Database, at = new Date()) {
  return db
    .selectFrom('provider_connections as c')
    .innerJoin('workspaces as w', 'w.id', 'c.workspace_id')
    .selectAll('c')
    .where('w.is_system', '=', true)
    .where('c.credential_source', '=', 'platform')
    .where('c.transport_provider', '=', si.transport_provider)
    .where('c.active', '=', true)
    .where('c.last_test_status', '=', providers.test_status_ok)
    .where('c.platform_credential_ref', '!=', '')
    .where((eb) => eb.or([eb('c.paused_at', 'is', null), eb('c.pause_until', '<=', at)]))
    .orderBy('c.created_at')
    .orderBy('c.id')
    .executeTakeFirst();
}

export async function reviewConnection(
  db: Database,
  workspace: WorkspaceScope,
  mode: CredentialMode,
  connectionId: string | null,
): Promise<{ connection: Connection; source: CredentialSource }> {
  if (mode === 'funded') {
    const connection = await platformConnection(db);
    if (!connection)
      throw new ApiError(422, 'Keyword research is unavailable right now', {
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
        .where((eb) =>
          eb.or([eb('c.paused_at', 'is', null), eb('c.pause_until', '<=', new Date())]),
        ),
    )
    .executeTakeFirst();
}
