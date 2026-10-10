/**
 * Two-step MCP changes. A prepare tool validates the change with its command
 * in dry-run mode and stores the exact payload behind a single-use token;
 * `confirm_change` runs that payload once, after the user agreed, in the same
 * transaction that consumes the token.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '../auth/actor.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import type { ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { mcpPolicy } from './config.ts';
import { writeActor } from './data.ts';
import { tokenHash } from './oauth.ts';
import { McpInputError, type McpPrincipal } from './types.ts';

const confirmedKinds = z.enum([
  'add_prompts',
  'archive_prompts',
  'launch_audit',
  'schedule',
  'declare_implemented',
]);
export type ConfirmedKind = z.infer<typeof confirmedKinds>;
export type Change = Readonly<{ id: string; kind: ConfirmedKind; payload: unknown }>;

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TOKEN_CHARS = 43;

/** 256 random bits in base62: no punctuation for a model to mangle. */
function base62Token(): string {
  let token = '';
  while (token.length < TOKEN_CHARS)
    for (const byte of randomBytes(64))
      // 248 = 4 × 62: rejecting the rest keeps every character equally likely.
      if (byte < 248 && token.length < TOKEN_CHARS) token += ALPHABET.charAt(byte % 62);
  return token;
}
const tokenHmac = (config: ServiceConfig, token: string) =>
  tokenHash(config, `mcp-confirmation:${token}`);

/** JSON with sorted keys, so the hash survives jsonb's key reordering. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const payloadHash = (payload: unknown) =>
  createHash('sha256').update(canonical(payload)).digest('hex');

/** Store a validated change for this connection; the token is shown once. */
export async function issueConfirmation(
  db: Database,
  config: ServiceConfig,
  input: Readonly<{
    id?: string;
    principal: McpPrincipal;
    actor: Actor;
    projectId: string;
    kind: ConfirmedKind;
    payload: Record<string, unknown>;
  }>,
) {
  const token = base62Token();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + mcpPolicy.confirmation_ttl_seconds * 1000);
  await db
    .insertInto('mcp_confirmations')
    .values({
      id: input.id ?? randomUUID(),
      workspace_id: input.actor.workspaceId,
      grant_id: input.principal.grantId,
      user_id: input.principal.userId,
      kind: input.kind,
      project_id: input.projectId,
      payload: JSON.stringify(input.payload),
      payload_hash: payloadHash(input.payload),
      token_hmac: tokenHmac(config, token),
      expires_at: expiresAt,
      consumed_at: null,
      created_at: now,
    })
    .execute();
  return { confirmation_token: token, expires_at: expiresAt.toISOString() };
}

/**
 * Run a prepared change once. The token must belong to this connection and be
 * unexpired and unused; the grant must still hold write and the member's live
 * role decides. The change and the token's consumption commit together, so a
 * refused or failed change leaves the token usable until it expires.
 */
export function confirmChange<T>(
  db: Database,
  config: ServiceConfig,
  principal: McpPrincipal,
  token: string,
  run: (trx: Database, actor: Actor, change: Change) => Promise<T>,
): Promise<{ kind: ConfirmedKind; result: T }> {
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('mcp_confirmations')
      .selectAll()
      .where('token_hmac', '=', tokenHmac(config, token))
      .forUpdate()
      .executeTakeFirst();
    if (!row || row.grant_id !== principal.grantId)
      throw new McpInputError(
        'This confirmation token is not valid for this connection. Prepare the change again.',
      );
    if (row.consumed_at) throw new McpInputError('This change was already confirmed.');
    if (row.expires_at.getTime() <= Date.now())
      throw new McpInputError(
        'This confirmation expired. Prepare the change again and confirm it within ten minutes.',
      );
    if (payloadHash(row.payload) !== row.payload_hash)
      throw new Error('A stored MCP confirmation payload changed');
    const kind = confirmedKinds.parse(row.kind);
    const { actor } = await writeActor(trx, principal, row.project_id);
    const result = await run(trx, actor, { id: row.id, kind, payload: row.payload });
    await trx
      .updateTable('mcp_confirmations')
      .set({ consumed_at: new Date() })
      .where('id', '=', row.id)
      .execute();
    await recordSecurityEvent(
      trx,
      `mcp.write.${kind}`,
      principal.userId,
      row.workspace_id,
      row.project_id,
    );
    return { kind, result };
  });
}
