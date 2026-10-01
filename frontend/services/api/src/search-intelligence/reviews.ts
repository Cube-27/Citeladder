import { randomUUID } from 'node:crypto';
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { strings } from '../db/json.ts';
import { ApiError, notFound } from '../errors.ts';
import { dataforseoAccountIdentity } from '../providers/dataforseo-identity.ts';
import { resolveSite } from '../projects/site-resolution.ts';
import { fetchWebsite } from '../projects/safe-fetch.ts';
import {
  preferencesBody,
  reviewBody,
  type ReviewInput,
} from '../routes/search-intelligence-contracts.ts';
import { competitorTarget, ownedTargets, type CanonicalTarget } from './targets.ts';
import {
  buildRequest,
  canonicalJson,
  quoteDataset,
  scopeHash,
  si,
  type RequestOptions,
} from './requests.ts';
import type { Scope } from './reads.ts';
import { runView } from './views.ts';

const error = (code: string, message: string) =>
  new ApiError(422, message, { code: asApiErrorCode(code) });
function existing(db: Database, scope: Scope, key: string) {
  return scope.workspace
    .selectFrom(db, 'search_intelligence_runs')
    .selectAll()
    .where('project_id', '=', scope.projectId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst();
}
async function savedProject(db: Database, scope: Scope) {
  const project = await scope.workspace
    .selectFrom(db, 'projects')
    .selectAll()
    .where('id', '=', scope.projectId)
    .executeTakeFirst();
  if (!project) throw notFound('Project');
  const owned = await scope.workspace
    .selectFrom(db, 'projects')
    .innerJoin('owned_domains', 'owned_domains.project_id', 'projects.id')
    .select(['owned_domains.id', 'owned_domains.domain'])
    .where('projects.id', '=', scope.projectId)
    .orderBy('owned_domains.created_at')
    .orderBy('owned_domains.id')
    .execute();
  const competitors = await scope.workspace
    .selectFrom(db, 'projects')
    .innerJoin('competitors', 'competitors.project_id', 'projects.id')
    .select(['competitors.id', 'competitors.name', 'competitors.domains'])
    .where('projects.id', '=', scope.projectId)
    .execute();
  return { project, targets: ownedTargets(project, owned), competitors };
}
function comparison(saved: Awaited<ReturnType<typeof savedProject>>, id: string) {
  const row = saved.competitors.find((item) => item.id === id);
  if (!row) throw error('competitor_not_found', 'Selected competitor is not in this project');
  const target = competitorTarget(row, strings(row.domains));
  if (!target)
    throw error('unsupported_target', 'Competitor must have one canonical saved website');
  return target;
}
export async function resolveCompetitor(target: CanonicalTarget) {
  let status = 0;
  try {
    const site = await resolveSite(target.origin, async (url, options) => {
      const result = await fetchWebsite(url, options);
      status = result.status;
      return result;
    });
    const resolved = competitorTarget({ id: target.identity, name: target.label }, [site.url]);
    if (
      !resolved ||
      resolved.registrable_domain !== target.registrable_domain ||
      status < 200 ||
      status >= 400
    )
      throw new Error('Unsupported resolved target');
    return resolved;
  } catch {
    throw error('unsupported_target', 'Could not confirm the saved competitor website');
  }
}

/** Unpaid resolution precedes the project lock; the quoted plan is then frozen atomically. */
export async function createReview(
  db: Database,
  scope: Scope,
  actorId: string,
  key: string,
  input: ReviewInput,
  encryptionKey: string,
  options: { now?: Date; resolve?: typeof resolveCompetitor } = {},
) {
  const prior = await existing(db, scope, key);
  if (prior) return runView(prior);
  const initial = await savedProject(db, scope),
    payload = reviewBody.parse(input);
  const savedScope = preferencesBody.parse(
    initial.project.search_intelligence_preferences,
  ).research_scope;
  const researchScope = payload.research_scope ?? savedScope;
  const reuse = payload.reuse_recent && !['refresh', 'increase_depth'].includes(payload.action);
  if (
    researchScope === 'exact_host' &&
    payload.datasets.some((item) => item.kind === 'backlink_history')
  )
    throw error('unsupported_scope', 'History requires domain and subdomains scope');
  if (
    researchScope === 'exact_host' &&
    payload.datasets.some(
      (item) =>
        ['missing_keywords', 'shared_keywords'].includes(item.kind) &&
        ['traffic', 'position'].includes(item.order),
    )
  )
    throw error(
      'unsupported_order',
      'Exact-host comparisons support volume, CPC or difficulty ordering',
    );
  const saved = new Map<string, CanonicalTarget>();
  for (const item of payload.datasets)
    if (item.competitor_id) saved.set(item.competitor_id, comparison(initial, item.competitor_id));
  const resolved = new Map<string, CanonicalTarget>();
  for (const [id, target] of saved)
    resolved.set(id, await (options.resolve ?? resolveCompetitor)(target));
  return db.transaction().execute(async (trx) => {
    await scope.workspace
      .selectFrom(trx, 'projects')
      .select('id')
      .where('id', '=', scope.projectId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const replay = await existing(trx, scope, key);
    if (replay) return runView(replay);
    const current = await savedProject(trx, scope);
    for (const [id, target] of saved) {
      let same = false;
      try {
        same = canonicalJson(comparison(current, id)) === canonicalJson(target);
      } catch {
        /* changed or removed */
      }
      if (!same) throw error('target_changed', 'Competitors changed; review again');
    }
    const target = payload.owned_target_id
      ? current.targets.find((item) => item.identity === payload.owned_target_id)
      : current.targets.length === 1
        ? current.targets[0]
        : undefined;
    if (!target) throw error('unsupported_target', 'Select one eligible saved canonical website');
    if (
      payload.previous_run_id &&
      !(await scope.workspace
        .selectFrom(trx, 'search_intelligence_runs')
        .select('id')
        .where('project_id', '=', scope.projectId)
        .where('id', '=', payload.previous_run_id)
        .executeTakeFirst())
    )
      throw notFound('Previous run');
    let connections = scope.workspace
      .selectFrom(trx, 'provider_connections')
      .selectAll()
      .where('transport_provider', '=', si.transport_provider)
      .where('active', '=', true)
      .where('last_test_status', '=', si.connection_test_ok)
      .where('api_key_encrypted', '!=', '');
    if (payload.connection_id) connections = connections.where('id', '=', payload.connection_id);
    const eligible = await connections.orderBy('created_at').execute();
    if (eligible.length !== 1)
      throw error(
        eligible.length ? 'dataforseo_connection_ambiguous' : 'dataforseo_connection_required',
        'Select one eligible DataForSEO connection',
      );
    const connection = eligible[0]!,
      at = options.now ?? new Date();
    const location = payload.location_code || current.project.serp_location_code || null;
    const language =
      payload.language_code.trim().toLowerCase() ||
      current.project.serp_language_code ||
      current.project.language_code;
    if (
      payload.datasets.some((item) => !si.backlink_kinds.includes(item.kind)) &&
      (!location ||
        !policy.dataforseo.constants.supported_location_codes.includes(location) ||
        !policy.dataforseo.constants.language_codes.includes(language))
    )
      throw error('unsupported_market', 'Select a supported Labs location and language');
    const plan: Record<string, unknown>[] = [],
      reused: Record<string, unknown>[] = [];
    let total = 0,
      plannedRows = 0;
    for (const [index, selection] of payload.datasets.entries()) {
      const compare = ['missing_keywords', 'shared_keywords'].includes(selection.kind);
      const datasetTarget =
        !compare && selection.competitor_id ? resolved.get(selection.competitor_id)! : target;
      const counterpart = compare ? resolved.get(selection.competitor_id!)! : null;
      const depth =
        selection.kind === 'backlink_history'
          ? si.history_max_observations
          : ['footprint', 'backlink_summary'].includes(selection.kind)
            ? 1
            : selection.depth;
      const o: RequestOptions = {
        kind: selection.kind,
        target: datasetTarget,
        comparison: counterpart,
        location,
        language,
        limit: Math.min(depth, si.page_size),
        offset: 0,
        scope: researchScope,
        seed: selection.seed,
        grouping: selection.grouping,
        order: selection.order,
        minVolume: selection.min_volume,
        dateFrom: new Date(at.getTime() - si.history_days * 86400000).toISOString().slice(0, 10),
        dateTo: new Date(at.getTime() - 86400000).toISOString().slice(0, 10),
      };
      const first = buildRequest(o),
        hash = scopeHash(o, first.payload);
      const snapshot = reuse
        ? await scope.workspace
            .selectFrom(trx, 'search_intelligence_datasets')
            .selectAll()
            .where('project_id', '=', scope.projectId)
            .where('scope_hash', '=', hash)
            .where('status', '=', 'published')
            .where('coverage', 'in', ['complete', 'empty'])
            .where('requested_rows', '>=', depth)
            .where('published_at', '>=', new Date(at.getTime() - si.reuse_days * 86400000))
            .orderBy('published_at', 'desc')
            .executeTakeFirst()
        : undefined;
      if (snapshot) {
        reused.push({
          dataset_id: snapshot.id,
          dataset_kind: snapshot.dataset_kind,
          published_at: snapshot.published_at?.toISOString() ?? null,
        });
        continue;
      }
      const quote = quoteDataset(selection.kind, depth);
      total += quote.costMicrousd;
      plannedRows += depth;
      for (let page = 0; page < quote.calls; page++) {
        const request = buildRequest({
          ...o,
          limit: Math.min(depth - page * si.page_size, si.page_size),
          offset: page * si.page_size,
        });
        plan.push({
          dataset_key: `${index}:${hash}`,
          dataset_kind: selection.kind,
          research_scope: researchScope,
          scope_hash: hash,
          target: datasetTarget,
          comparison: counterpart,
          requested_rows: depth,
          endpoint: request.endpoint,
          request: request.payload,
          page,
          estimated_cost_usd: String(quote.costMicrousd / 1e6 / quote.calls),
        });
      }
    }
    const run = await trx
      .insertInto('search_intelligence_runs')
      .values({
        id: randomUUID(),
        workspace_id: scope.workspace.workspaceId,
        project_id: scope.projectId,
        actor_user_id: actorId,
        previous_run_id: payload.previous_run_id,
        connection_id: connection.id,
        connection_revision: connection.credential_revision,
        account_identity: dataforseoAccountIdentity(connection.api_key_encrypted, encryptionKey),
        status: 'reviewed',
        action: payload.action,
        idempotency_key: key,
        frozen_scope: JSON.stringify({
          research_scope: researchScope,
          owned_target: target,
          location_code: location,
          language_code: language,
          datasets: payload.datasets,
          connection_id: connection.id,
          connection_revision: connection.credential_revision,
        }),
        call_plan: JSON.stringify(plan),
        reused_datasets: JSON.stringify(reused),
        pricing_version: si.price_version,
        estimated_cost_usd: (total / 1e6).toFixed(6),
        planned_calls: plan.length,
        planned_rows: plannedRows,
        expires_at: new Date(at.getTime() + si.review_ttl_seconds * 1000),
        created_at: at,
        updated_at: at,
        analytics_task_id: null,
        cancelled_at: null,
        completed_at: null,
        confirmed_at: null,
        provider_reported_cost_usd: null,
        completed_calls: 0,
        received_rows: 0,
        uncertain_calls: 0,
        error_code: '',
        error_detail: '',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    if (payload.save_as_defaults)
      await trx
        .updateTable('projects')
        .set({
          search_intelligence_preferences: preferencesBody.parse({
            research_scope: researchScope,
            owned_target_id: payload.owned_target_id,
            competitor_ids: [...saved.keys()],
            location_code: location,
            language_code: language,
            reuse_recent: reuse,
            depths: {
              ...preferencesBody.parse(current.project.search_intelligence_preferences).depths,
              ...Object.fromEntries(
                payload.datasets
                  .filter((item) => Object.hasOwn(si.default_depths, item.kind))
                  .map((item) => [item.kind, item.depth]),
              ),
            },
          }),
        })
        .where('workspace_id', '=', scope.workspace.workspaceId)
        .where('id', '=', scope.projectId)
        .execute();
    return runView(run);
  });
}
