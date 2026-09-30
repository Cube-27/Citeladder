import { randomUUID } from 'node:crypto';

import type { Database } from '../db/database.ts';
import { IntegrationClient, IntegrationError } from './client.ts';
import { integrationSettings, type IntegrationTransport } from './config.ts';

const settings = integrationSettings();

/** Refresh a grant outside a transaction and persist only while its fence holds. */
export async function freshAccessToken(
  db: Database,
  grantId: string,
  workspaceId: string,
): Promise<string> {
  const client = new IntegrationClient();
  const cutoff = Date.now() + settings.token_refresh_skew_seconds * 1000;
  for (
    let wait = 0;
    wait <= settings.token_refresh_wait_seconds * 1000;
    wait += settings.token_refresh_poll_seconds * 1000
  ) {
    const claimId = randomUUID();
    const claimed = await db.transaction().execute(async (trx) => {
      const grant = await trx
        .selectFrom('integration_oauth_grants')
        .selectAll()
        .where('id', '=', grantId)
        .where('workspace_id', '=', workspaceId)
        .forUpdate()
        .executeTakeFirst();
      if (grant === undefined || grant.status !== 'connected')
        throw new IntegrationError('grant_auth_failed', 'Integration grant is unavailable');
      if (grant.token_expires_at === null || new Date(grant.token_expires_at).getTime() > cutoff) {
        return { token: client.secrets.cipher.decrypt(grant.access_token_encrypted), claim: null };
      }
      if (
        grant.refresh_claim_expires_at !== null &&
        new Date(grant.refresh_claim_expires_at).getTime() > Date.now()
      )
        return null;
      if (!grant.refresh_token_encrypted)
        throw new IntegrationError('grant_auth_failed', 'Integration grant needs reconnection');
      const leaseUntil = new Date(Date.now() + settings.token_refresh_claim_seconds * 1000);
      await trx
        .updateTable('integration_oauth_grants')
        .set({ refresh_claim_id: claimId, refresh_claim_expires_at: leaseUntil })
        .where('id', '=', grantId)
        .where('workspace_id', '=', workspaceId)
        .execute();
      return {
        token: null,
        claim: {
          id: claimId,
          revision: grant.token_revision,
          transport: grant.transport as IntegrationTransport,
          refresh: client.secrets.cipher.decrypt(grant.refresh_token_encrypted),
        },
      };
    });
    if (claimed?.token) return claimed.token;
    if (claimed === null) {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), settings.token_refresh_poll_seconds * 1000);
      });
      continue;
    }
    const claim = claimed.claim;
    if (claim === null) throw new Error('refresh claim was not returned');
    try {
      const tokens = await client.token(claim.transport, {
        grant_type: 'refresh_token',
        refresh_token: claim.refresh,
      });
      const now = new Date();
      const updated = await db
        .updateTable('integration_oauth_grants')
        .set({
          access_token_encrypted: client.secrets.cipher.encrypt(tokens.accessToken),
          refresh_token_encrypted: tokens.refreshToken
            ? client.secrets.cipher.encrypt(tokens.refreshToken)
            : '',
          token_expires_at:
            tokens.expiresIn === null ? null : new Date(now.getTime() + tokens.expiresIn * 1000),
          ...(tokens.scopes.length ? { granted_scopes: JSON.stringify(tokens.scopes) } : {}),
          status: 'connected',
          token_revision: claim.revision + 1,
          refresh_claim_id: null,
          refresh_claim_expires_at: null,
          updated_at: now,
        })
        .where('id', '=', grantId)
        .where('workspace_id', '=', workspaceId)
        .where('refresh_claim_id', '=', claim.id)
        .where('token_revision', '=', claim.revision)
        .returning('id')
        .executeTakeFirst();
      if (updated) return tokens.accessToken;
      const current = await db
        .selectFrom('integration_oauth_grants')
        .select('access_token_encrypted')
        .where('id', '=', grantId)
        .where('workspace_id', '=', workspaceId)
        .executeTakeFirst();
      if (current === undefined)
        throw new IntegrationError('grant_auth_failed', 'Integration grant is unavailable');
      return client.secrets.cipher.decrypt(current.access_token_encrypted);
    } catch (error) {
      await db
        .updateTable('integration_oauth_grants')
        .set({ refresh_claim_id: null, refresh_claim_expires_at: null })
        .where('id', '=', grantId)
        .where('workspace_id', '=', workspaceId)
        .where('refresh_claim_id', '=', claim.id)
        .execute();
      throw error;
    }
  }
  throw new IntegrationError('token_refresh_failed', 'Integration token refresh is busy', true);
}
