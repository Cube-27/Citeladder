import { sql } from 'kysely';
import type { Actor } from '../auth/actor.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import type { ServiceConfig } from '../config.ts';
import { base62, base62Length, fingerprint } from '../crypto-text.ts';
import type { Database } from '../db/database.ts';
import { mcpPolicy } from './config.ts';
import type { PreparedChange } from '../changes/kind.ts';
import { changeKinds } from '../changes/kinds.ts';
import { claimSeconds, confirmOnce } from '../changes/confirm-once.ts';
import { authorize } from '../commands/permission.ts';
import { ApiError } from '../errors.ts';
import { isMcpChangeKind, type McpChangeKind } from './change-kinds.ts';
import { writeActor } from './data.ts';
import { tokenHash } from './oauth.ts';
import { McpInputError, type McpPrincipal } from './types.ts';

const tokenHmac = (config: ServiceConfig, token: string) =>
  tokenHash(config, `mcp-confirmation:${token}`);

export async function issueConfirmation(
  db: Database,
  config: ServiceConfig,
  input: Readonly<{
    change: PreparedChange;
    principal: McpPrincipal;
    actor: Actor;
    kind: McpChangeKind;
    payload: Record<string, unknown>;
  }>,
) {
  const token = base62(base62Length(256));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + mcpPolicy.confirmation_ttl_seconds * 1000);
  await db
    .insertInto('mcp_confirmations')
    .values({
      id: input.change.id,
      workspace_id: input.actor.workspaceId,
      grant_id: input.principal.grantId,
      user_id: input.principal.userId,
      kind: input.kind,
      project_id: input.change.projectId,
      payload: JSON.stringify(input.payload),
      payload_hash: fingerprint(input.payload),
      token_hmac: tokenHmac(config, token),
      expires_at: expiresAt,
      consumed_at: null,
      created_at: now,
    })
    .execute();
  return { confirmation_token: token, expires_at: expiresAt.toISOString() };
}

type Confirmation = Readonly<{
  id: string;
  workspace_id: string;
  project_id: string;
  kind: McpChangeKind;
  payload: unknown;
}>;

async function openConfirmation(
  trx: Database,
  config: ServiceConfig,
  principal: McpPrincipal,
  token: string,
): Promise<Confirmation> {
  const row = await trx
    .selectFrom('mcp_confirmations')
    .selectAll()
    .where('token_hmac', '=', tokenHmac(config, token))
    .forUpdate()
    .executeTakeFirst();
  if (row?.grant_id !== principal.grantId)
    throw new McpInputError(
      'This confirmation token is not valid for this connection. Prepare the change again.',
    );
  if (row.consumed_at) throw new McpInputError('This change was already confirmed.');
  if (row.expires_at.getTime() <= Date.now())
    throw new McpInputError(
      'This confirmation expired. Prepare the change again and confirm it within ten minutes.',
    );
  if (fingerprint(row.payload) !== row.payload_hash)
    throw new Error('A stored MCP confirmation payload changed');
  const { kind } = row;
  if (!isMcpChangeKind(kind))
    throw new McpInputError(
      'This kind of change is no longer offered here. Make it in CiteLadder.',
    );
  return { ...row, kind };
}

async function consume(trx: Database, principal: McpPrincipal, row: Confirmation) {
  const consumed = await trx
    .updateTable('mcp_confirmations')
    .set({ consumed_at: new Date() })
    .where('id', '=', row.id)
    .where('consumed_at', 'is', null)
    .executeTakeFirst();
  if (!consumed.numUpdatedRows) throw new McpInputError('This change was already confirmed.');
  await recordSecurityEvent(
    trx,
    `mcp.write.${row.kind}`,
    principal.userId,
    row.workspace_id,
    row.project_id,
  );
}

const changeOf = (row: Confirmation) => ({ id: row.id, projectId: row.project_id });

type Confirm = Readonly<{
  db: Database;
  config: ServiceConfig;
  principal: McpPrincipal;
  token: string;
}>;

class RanUnauthorized extends McpInputError {}

const roleChanged = () =>
  new RanUnauthorized(
    'The change was made, but your role or this connection no longer allows it, so it was not recorded as confirmed.',
  );

async function stillAllowed(trx: Database, principal: McpPrincipal, row: Confirmation) {
  try {
    authorize(await writeActor(trx, principal, row.project_id), changeKinds[row.kind].permission);
  } catch (error) {
    if (error instanceof ApiError || error instanceof McpInputError) throw roleChanged();
    throw error;
  }
}

export async function confirmChange({ db, config, principal, token }: Confirm) {
  const found = await db
    .selectFrom('mcp_confirmations')
    .select(['id', 'kind'])
    .where('token_hmac', '=', tokenHmac(config, token))
    .executeTakeFirst();
  const open = async (trx: Database) => {
    const row = await openConfirmation(trx, config, principal, token);
    return { row, actor: await writeActor(trx, principal, row.project_id) };
  };
  const run = async (trx: Database, { row, actor }: Awaited<ReturnType<typeof open>>) => ({
    kind: row.kind,
    result: await changeKinds[row.kind].confirm(trx, config, actor, changeOf(row), row.payload),
  });
  if (!found || !isMcpChangeKind(found.kind) || !changeKinds[found.kind].live)
    return confirmOnce(db, {
      live: false,
      open,
      run,
      record: (trx, { row }) => consume(trx, principal, row),
    });
  return confirmOnce(db, {
    live: true,
    subject: `mcp-confirmation:${found.id}`,
    busy: () => new McpInputError('This change is already being made.'),
    open,
    claimedAt: async (trx, { row }) =>
      (
        await trx
          .selectFrom('mcp_confirmations')
          .select('claimed_at')
          .where('id', '=', row.id)
          .executeTakeFirstOrThrow()
      ).claimed_at,
    claim: async (trx, { row }) => {
      const outlives = claimSeconds() + mcpPolicy.confirmation_ttl_seconds;
      const { claimed_at } = await trx
        .updateTable('mcp_confirmations')
        .set({
          claimed_at: sql<Date>`clock_timestamp()`,
          expires_at: sql<Date>`greatest(expires_at, clock_timestamp() + make_interval(secs => ${outlives}))`,
        })
        .where('id', '=', row.id)
        .returning('claimed_at')
        .executeTakeFirstOrThrow();
      if (!claimed_at) throw new Error('An MCP confirmation claim stored no time');
      return claimed_at;
    },
    run,
    record: async (trx, { row }) => {
      await stillAllowed(trx, principal, row);
      await consume(trx, principal, row);
    },
    release: async (trx, { row }, { error, owned }) => {
      if (owned)
        await trx
          .updateTable('mcp_confirmations')
          .set({
            claimed_at: null,
            expires_at: sql<Date>`least(expires_at, created_at + make_interval(secs => ${mcpPolicy.confirmation_ttl_seconds}))`,
          })
          .where('id', '=', row.id)
          .execute();
      if (error instanceof RanUnauthorized)
        await recordSecurityEvent(
          trx,
          `mcp.write.${row.kind}.unauthorized`,
          principal.userId,
          row.workspace_id,
          row.project_id,
        );
    },
  });
}
