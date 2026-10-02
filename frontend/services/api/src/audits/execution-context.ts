import { z } from 'zod';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { resolveSettingSpec } from '../config.ts';
import { approvedEndpoint } from '../providers/connections.ts';
import { providerPolicy, type Engine, type ProviderTransport } from '../providers/config.ts';
import { dataforseoAccountIdentity } from '../providers/dataforseo-identity.ts';
import type { CapacityRequest } from '../providers/capacity.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { ProviderError, answerRequestSchema } from '../answer-engines/contracts.ts';
import { ownedAuditTask, type AuditTask } from '../queue/audit-queue.ts';
import {
  searchPolicy,
  searchPayload,
  type SearchEngine,
  type SearchRequest,
} from '../search-surfaces/dataforseo.ts';
import { auditPolicy, type AuditRuntime } from './config.ts';

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
  funding: fundingSchema.optional(),
});
const unavailable = () => new ProviderError(auditPolicy.constants.error_no_connection);

function platformSecret(
  transport: ProviderTransport,
  reference: string,
  env: Record<string, string | undefined>,
) {
  if (transport === 'dataforseo') {
    const spec = providerPolicy.platform_dataforseo;
    if (
      !reference ||
      reference !== String(resolveSettingSpec(spec.platform_credential_ref, env)).trim()
    )
      throw unavailable();
    const login = String(resolveSettingSpec(spec.api_login, env)).trim();
    const password = String(resolveSettingSpec(spec.api_password, env));
    if (!login || !password) throw unavailable();
    return JSON.stringify({ login, password });
  }
  const spec = providerPolicy.platform_credentials[transport];
  const secret = String(resolveSettingSpec(spec.secret, env));
  if (!reference || reference !== String(resolveSettingSpec(spec.reference, env)).trim() || !secret)
    throw unavailable();
  return secret;
}

/** The execution secret exists only in this detached context, never in snapshots or logs. */
export async function loadExecutionContext(
  db: Database,
  claimed: AuditTask,
  owner: string,
  runtime: AuditRuntime,
  encryptionKey: string,
  at = new Date(),
  env: Record<string, string | undefined> = process.env,
) {
  return db.transaction().execute(async (trx) => {
    const locked = await ownedAuditTask(trx, claimed, owner);
    if (!locked) return null;
    const { task, audit } = locked;
    const parsed = routeSchema.safeParse(task.provider_route_snapshot);
    if (!parsed.success) throw unavailable();
    const route = parsed.data;
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
    const connection = await trx
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
    if (
      !connection?.active ||
      connection.last_test_status !== 'ok' ||
      (connection.paused_at && (!connection.pause_until || connection.pause_until > at))
    )
      throw unavailable();
    if (
      task.provider_submission_ref &&
      (task.provider_connection_id !== connection.id ||
        task.provider_credential_revision !== connection.credential_revision)
    )
      throw new ProviderError('connection_changed');
    if (route.credential_source === 'platform') {
      if (!route.funding || route.funding.reservation_id !== route.reservation_id)
        throw unavailable();
      const hold = await trx
        .selectFrom('consumable_ledger')
        .select(
          sql<string>`coalesce(sum(case when entry_kind = 'reservation' then units when entry_kind = 'release' then -units else 0 end),0)`.as(
            'remaining',
          ),
        )
        .select(sql<boolean>`bool_or(entry_kind = 'reservation')`.as('reserved'))
        .where('workspace_id', '=', task.workspace_id)
        .where('billing_account_id', '=', route.funding.funding_account_id)
        .where('audit_id', '=', audit.id)
        .where('subject_kind', '=', 'audit')
        .where('subject_id', '=', task.id)
        .where('reservation_id', '=', route.funding.reservation_id)
        .where('capability_key', '=', 'audit_credits')
        .executeTakeFirstOrThrow();
      if (!hold.reserved || (!task.provider_submission_ref && BigInt(hold.remaining) < 1n))
        throw unavailable();
    } else if (route.funding || route.reservation_id) throw unavailable();
    let secret: string;
    try {
      secret =
        route.credential_source === 'platform'
          ? platformSecret(
              connection.transport_provider as ProviderTransport,
              connection.platform_credential_ref,
              env,
            )
          : createSecretCipher(encryptionKey).decrypt(connection.api_key_encrypted);
    } catch {
      throw unavailable();
    }
    const endpoint = approvedEndpoint(route.transport_provider, route.base_url, runtime.providers);
    const config = record(audit.configuration),
      measurement = record(config.measurement_policy);
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
          ? dataforseoAccountIdentity(connection.api_key_encrypted, encryptionKey)
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
      capacity,
    };
  });
}
export type ExecutionContext = NonNullable<Awaited<ReturnType<typeof loadExecutionContext>>>;
export function directRequest(context: ExecutionContext) {
  const { task, audit, config, measurement } = context;
  const parsed = answerRequestSchema.safeParse({
    logical_engine: task.logical_engine,
    transport_provider: task.transport_provider,
    transport_model: task.transport_model,
    prompt: task.prompt_text,
    system_instruction: audit.system_instruction,
    timeout_seconds: measurement.timeout_seconds,
    max_output_tokens: measurement.max_output_tokens,
    retrieval_enabled: measurement.retrieval_enabled,
    reasoning_effort: record(context.route).reasoning_effort,
    country_code: config.country_code ?? '',
    anthropic_max_uses: config.anthropic_max_uses ?? 0,
  });
  if (!parsed.success) throw new ProviderError('parse_error');
  return parsed.data;
}
export function frozenSurfaceRequest(
  context: ExecutionContext,
  submissionRef: string,
  runtime: AuditRuntime,
): SearchRequest {
  const snapshot = record(context.task.request_snapshot);
  const request: SearchRequest = {
    query: context.task.prompt_text,
    location_code: z.number().int().positive().parse(snapshot.location_code),
    language_code: z.string().min(1).parse(snapshot.language_code),
    device: z.enum(['desktop', 'mobile']).parse(snapshot.device),
    depth: searchPolicy.constants.default_depth,
    load_async_ai_overview: searchPolicy.constants.load_async_ai_overview,
    timeout_seconds: z
      .number()
      .positive()
      .parse(snapshot.timeout_seconds ?? runtime.search.timeoutSeconds),
    provider_submission_ref: submissionRef,
    request_settings: record(snapshot.request_settings),
  };
  searchPayload(context.task.logical_engine as SearchEngine, request);
  return request;
}
/** An authenticated provider failure pauses this concrete revision; a concurrent rotation wins. */
export function pauseExecutionCredential(
  db: Database,
  context: ExecutionContext,
  runtime: AuditRuntime,
  at: Date,
) {
  return db
    .updateTable('provider_connections')
    .set({
      paused_at: at,
      pause_until: new Date(at.getTime() + runtime.providers.keyGraceDays * 86400000),
      pause_reason: 'auth',
      updated_at: at,
    })
    .where('id', '=', context.connectionId)
    .where('workspace_id', '=', context.connectionWorkspaceId)
    .where('credential_source', '=', context.route.credential_source)
    .where('credential_revision', '=', context.revision)
    .execute();
}
