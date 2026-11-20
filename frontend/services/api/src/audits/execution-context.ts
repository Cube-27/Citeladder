import { z } from 'zod';
import { requireWorkspaceAccess } from '../entitlements/access.ts';
import { sql } from 'kysely';
import { openReservedUnits } from '../entitlements/ledger.ts';
import type { Database } from '../db/database.ts';
import type { SettingSource } from '../config/settings.ts';
import { approvedEndpoint } from '../providers/connections.ts';
import { providerPolicy, type Engine } from '../providers/config.ts';
import { dataforseoSecretIdentity } from '../providers/dataforseo-identity.ts';
import { connectionSecret } from '../providers/platform-secrets.ts';
import type { CapacityRequest } from '../providers/capacity.ts';
import { ProviderError } from '../providers/errors.ts';
import { ownedAuditTask, type AuditTask } from '../queue/audit-queue.ts';
import { searchPolicy } from '../search-surfaces/dataforseo.ts';
import { auditPolicy, type AuditRuntime } from './config.ts';
import { readFrozenConfiguration } from './frozen-configuration.ts';
import { TASK_CAPABILITIES } from './prompt-runs.ts';

const fundingSchema = z.object({ reservation_id: z.uuid(), funding_account_id: z.uuid() });
const routeSchema = z.object({
  connection_id: z.uuid(),
  credential_source: z.enum(['byok', 'platform']),
  logical_engine: z.string(),
  transport_provider: z.string(),
  transport_model: z.string(),
  base_url: z.string(),
  reservation_id: z.uuid().nullable(),
  reasoning_effort: z.string().nullable(),
  anthropic_thinking: z.string().nullish(),
  funding: fundingSchema.optional(),
});
const unavailable = () => new ProviderError(auditPolicy.constants.error_no_connection);

type RouteSnapshot = z.infer<typeof routeSchema>;
function assertRouteMatchesCatalog(task: AuditTask, route: RouteSnapshot) {
  const catalog = providerPolicy.routes[task.logical_engine as Engine];
  if (
    !catalog ||
    catalog.transport_provider !== task.transport_provider ||
    catalog.transport_model !== task.transport_model ||
    route.logical_engine !== task.logical_engine ||
    route.transport_provider !== task.transport_provider ||
    route.transport_model !== task.transport_model
  )
    throw new ProviderError(providerPolicy.errors.invalid_surface);
}
/** Platform routes need their own open reservation; BYOK routes must carry no funding. */
async function assertFundingHold(
  db: Database,
  task: AuditTask,
  auditId: string,
  route: RouteSnapshot,
) {
  if (route.credential_source !== 'platform') {
    if (route.funding) throw unavailable();
    return;
  }
  if (!route.funding || route.funding.reservation_id !== route.reservation_id) throw unavailable();
  const hold = await db
    .selectFrom('consumable_ledger')
    .select(sql<string>`coalesce(${openReservedUnits},0)`.as('remaining'))
    .select(sql<boolean>`bool_or(entry_kind = 'reservation')`.as('reserved'))
    .where('workspace_id', '=', task.workspace_id)
    .where('billing_account_id', '=', route.funding.funding_account_id)
    .where('audit_id', '=', auditId)
    .where('subject_kind', '=', 'audit')
    .where('subject_id', '=', task.id)
    .where('reservation_id', '=', route.funding.reservation_id)
    .where('capability_key', 'in', TASK_CAPABILITIES)
    .executeTakeFirstOrThrow();
  if (!hold.reserved || (!task.provider_submission_ref && BigInt(hold.remaining) < 1n))
    throw unavailable();
}
async function loadActiveConnection(db: Database, route: RouteSnapshot, task: AuditTask, at: Date) {
  const connection = await db
    .selectFrom('provider_connections as c')
    .innerJoin('workspaces as w', 'w.id', 'c.workspace_id')
    .selectAll('c')
    .select('w.is_system')
    .where('c.id', '=', route.connection_id)
    .where('c.credential_source', '=', route.credential_source)
    .where('c.transport_provider', '=', route.transport_provider)
    .where('w.is_system', '=', route.credential_source === 'platform')
    .$if(route.credential_source === 'byok', (query) =>
      query.where('c.workspace_id', '=', task.workspace_id),
    )
    .forShare('c')
    .executeTakeFirst();
  const paused =
    connection?.paused_at != null && (!connection.pause_until || connection.pause_until > at);
  // A refused provider account stops its queued work before any provider call.
  if (paused && connection.pause_reason === searchPolicy.constants.pause_reason_account)
    throw new ProviderError(searchPolicy.constants.error_account_unavailable);
  if (!connection?.active || connection.last_test_status !== 'ok' || paused) throw unavailable();
  return connection;
}
/** The execution secret exists only in this detached context, never in snapshots or logs. */
export async function loadExecutionContext(
  db: Database,
  claimed: AuditTask,
  owner: string,
  runtime: AuditRuntime,
  encryptionKey: string,
  options: {
    at?: Date;
    env?: SettingSource;
    access?: (workspaceId: string) => Promise<unknown>;
  } = {},
) {
  const { at = new Date(), env = process.env, access } = options;
  // A cached check reads outside the transaction, so it must run before taking the
  // transaction's connection: with a one-connection pool it would otherwise wait on itself.
  if (access) await access(claimed.workspace_id);
  return db.transaction().execute(async (trx) => {
    const locked = await ownedAuditTask(trx, claimed, owner);
    if (!locked) return null;
    const { task, audit } = locked;
    if (!access) await requireWorkspaceAccess(trx, audit.workspace_id);
    const parsed = routeSchema.safeParse(task.provider_route_snapshot);
    if (!parsed.success) throw unavailable();
    const route = parsed.data;
    assertRouteMatchesCatalog(task, route);
    const connection = await loadActiveConnection(trx, route, task, at);
    if (
      task.provider_submission_ref &&
      (task.provider_connection_id !== connection.id ||
        task.provider_credential_revision !== connection.credential_revision)
    )
      throw new ProviderError('connection_changed');
    await assertFundingHold(trx, task, audit.id, route);
    let secret: string;
    try {
      secret = connectionSecret(connection, encryptionKey, env);
    } catch {
      throw unavailable();
    }
    const endpoint = approvedEndpoint(route.transport_provider, route.base_url, runtime.providers);
    const config = readFrozenConfiguration(audit.configuration),
      measurement = config.measurement_policy;
    // The run cap bounds every execution; an audit without one cannot run.
    if (config.max_run_seconds === undefined) throw new ProviderError('parse_error');
    const maxRunSeconds = config.max_run_seconds;
    const capacity: CapacityRequest = {
      taskId: task.id,
      attempt: task.attempt_count + 1,
      engine: task.logical_engine,
      transport: task.transport_provider,
      source: route.credential_source,
      connectionId: connection.id,
      ...(route.funding ? { accountId: route.funding.funding_account_id } : {}),
      accountPoolIdentity:
        task.transport_provider === 'dataforseo' && route.credential_source === 'byok'
          ? dataforseoSecretIdentity(secret, encryptionKey)
          : '',
    };
    return {
      task,
      audit,
      route,
      connectionId: connection.id,
      connectionWorkspaceId: connection.workspace_id,
      revision: connection.credential_revision,
      secret,
      endpoint,
      config,
      measurement,
      maxRunSeconds,
      capacity,
    };
  });
}
export type ExecutionContext = NonNullable<Awaited<ReturnType<typeof loadExecutionContext>>>;
/** An authenticated provider failure pauses this concrete revision; a concurrent rotation wins. */
export function pauseExecutionCredential(
  db: Database,
  context: ExecutionContext,
  runtime: AuditRuntime,
  at: Date,
) {
  return pauseConnection(db, context, {
    reason: 'auth',
    until: new Date(at.getTime() + runtime.providers.keyGraceDays * 86400000),
    at,
  });
}

/**
 * A provider account that refuses every request (paused, unfunded) pauses this
 * revision briefly, so the rest of the queue fails fast and a restored account
 * resumes on its own.
 */
export function pauseUnavailableAccount(
  db: Database,
  context: ExecutionContext,
  runtime: AuditRuntime,
  at: Date,
) {
  return pauseConnection(db, context, {
    reason: searchPolicy.constants.pause_reason_account,
    until: new Date(at.getTime() + runtime.search.accountPauseMinutes * 60000),
    at,
  });
}

function pauseConnection(
  db: Database,
  context: ExecutionContext,
  pause: { reason: string; until: Date; at: Date },
) {
  return db
    .updateTable('provider_connections')
    .set({
      paused_at: pause.at,
      pause_until: pause.until,
      pause_reason: pause.reason,
      updated_at: pause.at,
    })
    .where('id', '=', context.connectionId)
    .where('workspace_id', '=', context.connectionWorkspaceId)
    .where('credential_source', '=', context.route.credential_source)
    .where('credential_revision', '=', context.revision)
    .execute();
}
