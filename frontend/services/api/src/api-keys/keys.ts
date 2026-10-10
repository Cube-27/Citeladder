/**
 * Public API keys: one workspace each, an optional project allowlist, and
 * scopes that intersect the creator's live role.
 *
 * The secret is shown once; only its HMAC (keyed by `API_KEY_PEPPER`) is
 * stored, found by its public prefix and compared in constant time. A key
 * whose creator leaves the workspace is revoked in that transaction.
 */
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

import {
  apiKeySchema,
  type ApiKey,
  type apiKeyCreateSchema,
  type ApiKeyCreated,
  type ApiKeyList,
  type ApiKeyScope,
} from '@citeladder/contracts/api-keys';
import { sql, type Selectable } from 'kysely';
import type { z } from 'zod';

import { recordSecurityEvent } from '../auth/security-events.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { admitApiKey, grantedValues } from '../entitlements/occupancy.ts';
import { ApiError, notFound } from '../errors.ts';
import type { ApiKeys } from '../generated/db-schema.ts';
import { lockAuthorizedWorkspace } from '../workspaces/service.ts';

export type ApiKeyRow = Selectable<ApiKeys>;

const P = policy.public_api;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const PREFIX_LENGTH = P.key_prefix.length + P.prefix_random_chars;

function base62(length: number): string {
  return Array.from({ length }, () => BASE62[randomInt(BASE62.length)]).join('');
}

/** `cl_live_` + random prefix characters + 32 random bytes, base62. */
function newSecret(): { prefix: string; secret: string } {
  const prefix = P.key_prefix + base62(P.prefix_random_chars);
  // 43 base62 characters carry at least 256 bits.
  const body = base62(Math.ceil((P.secret_random_bytes * 8) / Math.log2(BASE62.length)));
  return { prefix, secret: prefix + body };
}

function secretDigest(pepper: string, secret: string): Buffer {
  return createHmac('sha256', pepper).update(secret, 'utf8').digest();
}

function keyState(row: ApiKeyRow, now: Date): ApiKey['state'] {
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && row.expires_at <= now) return 'expired';
  return 'active';
}

function keyView(row: ApiKeyRow & { created_by_email: string | null }, now: Date): ApiKey {
  return apiKeySchema.parse({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    project_ids: row.project_ids,
    created_by_email: row.created_by_email,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at?.toISOString() ?? null,
    last_used_at: row.last_used_at?.toISOString() ?? null,
    revoked_at: row.revoked_at?.toISOString() ?? null,
    state: keyState(row, now),
  });
}

function keysWithCreator(db: Database, workspaceId: string) {
  return db
    .selectFrom('api_keys')
    .leftJoin('users', 'users.id', 'api_keys.created_by_user_id')
    .selectAll('api_keys')
    .select('users.email as created_by_email')
    .where('api_keys.workspace_id', '=', workspaceId);
}

export async function listApiKeys(db: Database, workspaceId: string): Promise<ApiKeyList> {
  const now = new Date();
  const granted = await grantedValues(db, workspaceId);
  const available = (granted?.get(policy.entitlements.api_access) ?? 0) >= 1;
  const rows = await keysWithCreator(db, workspaceId)
    .orderBy('api_keys.created_at', 'desc')
    .orderBy('api_keys.id')
    .execute();
  return {
    available,
    limit: available ? (granted?.get(policy.entitlements.api_keys) ?? 0) : null,
    keys: rows.map((row) => keyView(row, now)),
  };
}

/**
 * Create a key for the acting Owner/Admin. `read` is always granted; every
 * allowlisted project must belong to the workspace.
 */
export async function createApiKey(
  db: Database,
  pepper: string,
  workspaceId: string,
  userId: string,
  input: z.output<typeof apiKeyCreateSchema>,
): Promise<ApiKeyCreated> {
  const now = new Date();
  const expiresAt = input.expires_at === null ? null : new Date(input.expires_at);
  if (expiresAt !== null && expiresAt <= now)
    throw new ApiError(422, 'expires_at must be in the future');
  const scopes: ApiKeyScope[] = ['read', ...input.scopes.filter((scope) => scope !== 'read')];
  const projectIds = input.project_ids === null ? null : [...new Set(input.project_ids)];
  return db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, workspaceId, userId, 'manage_credentials');
    await admitApiKey(trx, workspaceId, now);
    if (projectIds !== null) {
      const owned = await trx
        .selectFrom('projects')
        .select('id')
        .where('workspace_id', '=', workspaceId)
        .where('id', 'in', projectIds)
        .execute();
      if (owned.length !== projectIds.length)
        throw new ApiError(422, 'Every project must belong to this workspace');
    }
    let generated = newSecret();
    while (
      await trx
        .selectFrom('api_keys')
        .select('id')
        .where('prefix', '=', generated.prefix)
        .executeTakeFirst()
    )
      generated = newSecret();
    const id = randomUUID();
    await trx
      .insertInto('api_keys')
      .values({
        id,
        workspace_id: workspaceId,
        name: input.name,
        prefix: generated.prefix,
        secret_hmac: secretDigest(pepper, generated.secret),
        scopes,
        project_ids: projectIds,
        created_by_user_id: userId,
        created_at: now,
        expires_at: expiresAt,
        last_used_at: null,
        rejection_logged_at: null,
        revoked_at: null,
        revoke_reason: null,
      })
      .execute();
    await recordSecurityEvent(trx, 'api_key.create', userId, workspaceId, id);
    const row = await keysWithCreator(trx, workspaceId)
      .where('api_keys.id', '=', id)
      .executeTakeFirstOrThrow();
    return { key: keyView(row, now), secret: generated.secret };
  });
}

/** Revoke one key; revoking a revoked key is a no-op. */
export async function revokeApiKey(
  db: Database,
  workspaceId: string,
  userId: string,
  keyId: string,
): Promise<ApiKey> {
  return db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, workspaceId, userId, 'manage_credentials');
    const revoked = await trx
      .updateTable('api_keys')
      .set({ revoked_at: new Date(), revoke_reason: 'revoked' })
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', keyId)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (revoked) await recordSecurityEvent(trx, 'api_key.revoke', userId, workspaceId, keyId);
    const row = await keysWithCreator(trx, workspaceId)
      .where('api_keys.id', '=', keyId)
      .executeTakeFirst();
    if (!row) throw notFound('API key');
    return keyView(row, new Date());
  });
}

function invalidKey(message = 'A valid API key is required'): ApiError {
  return new ApiError(401, message, {
    code: 'invalid_api_key',
    headers: { 'www-authenticate': 'Bearer' },
  });
}

/** Record a refused revoked/expired key at most once per key per interval. */
async function recordRejection(
  db: Database,
  row: ApiKeyRow,
  event: 'api_key.rejected_revoked' | 'api_key.rejected_expired',
  now: Date,
): Promise<void> {
  const since = new Date(now.getTime() - P.rejection_event_interval_seconds * 1000);
  await db.transaction().execute(async (trx) => {
    const claimed = await trx
      .updateTable('api_keys')
      .set({ rejection_logged_at: now })
      .where('id', '=', row.id)
      .where((eb) =>
        eb.or([eb('rejection_logged_at', 'is', null), eb('rejection_logged_at', '<', since)]),
      )
      .returning('id')
      .executeTakeFirst();
    if (claimed)
      await recordSecurityEvent(trx, event, row.created_by_user_id, row.workspace_id, row.id);
  });
}

/** The live key a `Bearer` header names, or 401 `invalid_api_key`. */
export async function authenticateApiKey(
  db: Database,
  pepper: string,
  authorization: string | undefined,
  now = new Date(),
): Promise<ApiKeyRow> {
  const match = /^Bearer\s+(\S+)$/iu.exec(authorization?.trim() ?? '');
  const secret = match?.[1] ?? '';
  if (!secret.startsWith(P.key_prefix) || secret.length <= PREFIX_LENGTH) throw invalidKey();
  const row = await db
    .selectFrom('api_keys')
    .selectAll()
    .where('prefix', '=', secret.slice(0, PREFIX_LENGTH))
    .executeTakeFirst();
  const supplied = secretDigest(pepper, secret);
  if (!row || !timingSafeEqual(row.secret_hmac, supplied)) throw invalidKey();
  if (row.revoked_at) {
    await recordRejection(db, row, 'api_key.rejected_revoked', now);
    throw invalidKey('This API key was revoked');
  }
  if (row.expires_at && row.expires_at <= now) {
    await recordRejection(db, row, 'api_key.rejected_expired', now);
    throw invalidKey('This API key has expired');
  }
  return row;
}

/** Stamp `last_used_at` at most once per resolution window. */
export async function touchApiKey(db: Database, row: ApiKeyRow, now = new Date()): Promise<void> {
  const stale = new Date(now.getTime() - P.last_used_resolution_seconds * 1000);
  if (row.last_used_at && row.last_used_at > stale) return;
  await db
    .updateTable('api_keys')
    .set({ last_used_at: now })
    .where('id', '=', row.id)
    .where(sql<boolean>`last_used_at IS NULL OR last_used_at <= ${stale}`)
    .execute();
}
