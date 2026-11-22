import type { Actor } from '../auth/actor.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import type { ServiceConfig } from '../config.ts';
import { base62, base62Length, fingerprint } from '../crypto-text.ts';
import type { Database } from '../db/database.ts';
import { mcpPolicy } from './config.ts';
import type { PreparedChange } from '../changes/kind.ts';
import { changeKinds } from '../changes/kinds.ts';
import { whileTryLocked } from '../db/advisory-lock.ts';
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
  await trx
    .updateTable('mcp_confirmations')
    .set({ consumed_at: new Date() })
    .where('id', '=', row.id)
    .execute();
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

function confirmInTransaction({ db, config, principal, token }: Confirm) {
  return db.transaction().execute(async (trx) => {
    const row = await openConfirmation(trx, config, principal, token);
    const actor = await writeActor(trx, principal, row.project_id);
    const result = await changeKinds[row.kind].confirm(
      trx,
      config,
      actor,
      changeOf(row),
      row.payload,
    );
    await consume(trx, principal, row);
    return { kind: row.kind, result };
  });
}

function confirmLive({ db, config, principal, token }: Confirm, id: string) {
  return whileTryLocked(db, {
    subject: `mcp-confirmation:${id}`,
    busy: () => new McpInputError('This change is already being made.'),
    run: async () => {
      const { row, actor } = await db.transaction().execute(async (trx) => {
        const opened = await openConfirmation(trx, config, principal, token);
        return { row: opened, actor: await writeActor(trx, principal, opened.project_id) };
      });
      const result = await changeKinds[row.kind].confirm(
        db,
        config,
        actor,
        changeOf(row),
        row.payload,
      );
      await db.transaction().execute((trx) => consume(trx, principal, row));
      return { kind: row.kind, result };
    },
  });
}

export async function confirmChange(input: Confirm) {
  const found = await input.db
    .selectFrom('mcp_confirmations')
    .select(['id', 'kind'])
    .where('token_hmac', '=', tokenHmac(input.config, input.token))
    .executeTakeFirst();
  if (found && isMcpChangeKind(found.kind) && changeKinds[found.kind].live)
    return confirmLive(input, found.id);
  return confirmInTransaction(input);
}
