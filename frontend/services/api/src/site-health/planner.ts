/** Explicit crawl admission freezes policy and commits all initial work together. */
import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { notFound } from '../errors.ts';
import { record, strings } from '../db/json.ts';
import { lockAccount, refreshRuntime, runtimeProjection } from '../entitlements/grants.ts';
import type {
  SiteHealthProfiles,
  SiteUrls,
  WorkspaceSiteHealthRuntime,
} from '../generated/db-schema.ts';
import { addAutomaticRoot, crawlScope, lockRuntime } from './frontier.ts';
import { budgetedPageLimit, reserveCrawlFetches, unresolvedEntitlement } from './fetch-budget.ts';
import {
  controls,
  crawlError,
  crawlSetting,
  frozenConfiguration,
  normalizeGlobs,
  normalizedSeed,
  projectWebsiteRoot,
  type CreateCrawlRequest,
} from './planner-policy.ts';
import { inventoryCrawlIds } from './reads/crawl.ts';
import { recordCrawlEvent, ACTIVE_CRAWL } from './site-task.ts';
import type { Crawl } from './task-fence.ts';
import { classifyUrlAdmission, type Scope } from './url-admission.ts';
import { canonicalIdentity } from './url-identity.ts';
import { hasDevelopmentWorkspace } from '../auth/development-access.ts';

export async function admissionRuntime(db: Database, workspaceId: string) {
  const now = new Date();
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (account) {
    // Billing takes capacity/account before runtime; match it before refreshing.
    await lockAccount(db, workspaceId, account.id);
    const state = await refreshRuntime(db, workspaceId, account.id, now);
    if (state.error) throw unresolvedEntitlement();
  } else
    await db
      .insertInto('workspace_site_health_runtime')
      .values({
        id: randomUUID(),
        workspace_id: workspaceId,
        ...runtimeProjection(null),
        resolved_registry_revision: policy.entitlements.registry_revision,
        resolved_entitlement_lifecycle_version: 0,
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.column('workspace_id').doNothing())
      .execute();
  const runtime = await lockRuntime(db, workspaceId);
  if (!runtime) throw new Error('Site Health runtime missing');
  return runtime;
}

export async function enqueueCrawlTask(
  db: Database,
  crawl: Crawl,
  input: {
    kind: string;
    url: string;
    siteUrlId?: string;
    depth?: number;
    position?: number;
    priority?: number;
    generation?: number;
    delay?: number;
  },
) {
  const now = new Date();
  const hash = canonicalIdentity(input.url).hash;
  const generation = input.generation ?? 0;
  const id = randomUUID();
  const row = await db
    .insertInto('site_crawl_tasks')
    .values({
      id,
      workspace_id: crawl.workspace_id,
      crawl_id: crawl.id,
      site_url_id: input.siteUrlId ?? null,
      task_kind: input.kind,
      requested_url: input.url,
      url_hash: hash,
      depth: input.depth ?? 0,
      generation,
      randomized_position: input.position ?? 0,
      priority: input.priority ?? 0,
      idempotency_key: `${crawl.id}:${input.kind}:${hash}:${generation}`,
      status: 'queued',
      max_attempts: Number(crawlSetting('max_attempts')),
      attempt_count: 0,
      conflict_count: 0,
      classification_expected: false,
      error_code: '',
      error_detail: '',
      available_at: new Date(now.getTime() + (input.delay ?? 0) * 1000),
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column('idempotency_key').doNothing())
    .returning('id')
    .executeTakeFirst();
  return row?.id ?? null;
}

async function seedObservation(
  db: Database,
  crawl: Crawl,
  url: Selectable<SiteUrls>,
  rerun = false,
) {
  await db
    .insertInto('site_url_observations')
    .values({
      id: randomUUID(),
      workspace_id: crawl.workspace_id,
      project_id: crawl.project_id,
      crawl_id: crawl.id,
      site_url_id: url.id,
      source_kind: rerun ? 'root' : url.latest_source_kind || 'link',
      depth: rerun ? 0 : url.depth,
      observed_url: url.normalized_url,
      final_url: url.normalized_url,
      content_type: rerun ? '' : url.latest_content_type || '',
      title: url.latest_title || '',
      value_kind: '',
      value_priority: 0,
      rewrite_reason: '',
      rewrite_version: '',
      created_at: new Date(),
    })
    .onConflict((conflict) => conflict.columns(['crawl_id', 'site_url_id']).doNothing())
    .execute();
}

async function seedMonitored(db: Database, crawl: Crawl) {
  const rows = await db
    .selectFrom('site_urls as u')
    .innerJoin('monitored_site_urls as m', (join) =>
      join
        .onRef('m.site_url_id', '=', 'u.id')
        .onRef('m.workspace_id', '=', 'u.workspace_id')
        .onRef('m.project_id', '=', 'u.project_id'),
    )
    .selectAll('u')
    .where('u.workspace_id', '=', crawl.workspace_id)
    .where('u.project_id', '=', crawl.project_id)
    .where('m.active', '=', true)
    .orderBy('u.normalized_url')
    .execute();
  const current = await db
    .selectFrom('site_crawl_tasks')
    .select(sql<number>`count(*)::int`.as('count'))
    .where('workspace_id', '=', crawl.workspace_id)
    .where('crawl_id', '=', crawl.id)
    .executeTakeFirstOrThrow();
  const budget = Math.max(
    0,
    Number(record(crawl.configuration).requested_page_limit) - current.count,
  );
  const admitted = rows.filter(
    (url) => classifyUrlAdmission(url.normalized_url, crawlScope(crawl)).accepted,
  );
  // Preserve the boundary observation even when no further task fits the budget.
  await Promise.all(admitted.slice(0, budget + 1).map((url) => seedObservation(db, crawl, url)));
  await Promise.all(
    admitted.slice(0, budget).map((url, position) =>
      enqueueCrawlTask(db, crawl, {
        kind: 'analyze',
        url: url.normalized_url,
        siteUrlId: url.id,
        position,
        delay: Math.min(
          position * Number(crawlSetting('monitored_seed_stagger_seconds')),
          Number(crawlSetting('monitored_seed_stagger_max_seconds')),
        ),
      }),
    ),
  );
}

type Runtime = Selectable<WorkspaceSiteHealthRuntime>;
type Profile = Selectable<SiteHealthProfiles>;

function insertCrawl(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    profileId: string;
    root: string;
    configuration: Record<string, unknown>;
    runtime: Runtime;
    seed?: string | null;
    rerun: boolean;
  },
) {
  const now = new Date();
  return db
    .insertInto('site_crawls')
    .values({
      id: randomUUID(),
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      profile_id: input.profileId,
      root_url: input.root,
      random_seed: normalizedSeed(input.seed),
      configuration: JSON.stringify(input.configuration),
      sample_mode: input.runtime.discovery_mode === 'sample',
      status: 'queued',
      analysis_status: 'pending',
      discovery_status: input.rerun ? 'completed' : 'running',
      inventory_complete: input.rerun,
      discovery_requested_count: input.rerun ? 0 : Number(input.configuration.requested_page_limit),
      analysis_requested_count: 0,
      discovered_url_count: input.rerun ? 1 : 0,
      admitted_url_count: input.rerun ? 1 : 0,
      analyzed_url_count: 0,
      failed_url_count: 0,
      partial_reason: '',
      error_message: '',
      extractor_version: policy.site_health.versions.extractor,
      analyzer_version: policy.site_health.versions.analyzer,
      rule_catalog_version: policy.site_health.versions.rules,
      scoring_version: policy.site_health.reads.scoring_version,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function creationEvents(db: Database, crawl: Crawl, rerunSiteUrlId?: string) {
  await recordCrawlEvent(
    db,
    crawl,
    'crawl.created',
    rerunSiteUrlId ? 'page rerun crawl created' : 'crawl created',
    {
      root_url: crawl.root_url,
      sample_mode: crawl.sample_mode,
      source_kind: 'root',
      ...(rerunSiteUrlId ? { rerun_site_url_id: rerunSiteUrlId } : {}),
    },
  );
  await recordCrawlEvent(db, crawl, 'crawl.queued', 'crawl queued', {});
}

function refreshProfile(
  db: Database,
  workspaceId: string,
  projectId: string,
  root: string,
  scope: Scope,
) {
  const now = new Date();
  const values = {
    root_url: root,
    root_host: new URL(root).hostname,
    registrable_domain: scope.domain!,
    include_globs: JSON.stringify(scope.include),
    exclude_globs: JSON.stringify(scope.exclude),
    updated_at: now,
  };
  return db
    .insertInto('site_health_profiles')
    .values({
      id: randomUUID(),
      workspace_id: workspaceId,
      project_id: projectId,
      selection_version: 0,
      created_at: now,
      ...values,
    })
    .onConflict((conflict) =>
      conflict
        .column('project_id')
        .doUpdateSet(values)
        .where('site_health_profiles.workspace_id', '=', workspaceId),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Caller owns the transaction: workspace -> project -> capacity/account -> runtime -> profile. */
export async function createCrawl(db: Database, workspaceId: string, request: CreateCrawlRequest) {
  if (crawlSetting('advanced_controls_enabled') !== true)
    await db
      .selectFrom('workspaces')
      .select('id')
      .where('id', '=', workspaceId)
      .forShare()
      .executeTakeFirst();
  const project = await db
    .selectFrom('projects')
    .select('website_url')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', request.project_id)
    .forUpdate()
    .executeTakeFirst();
  if (!project) throw notFound('Project');
  const existing = await db
    .selectFrom('site_crawls')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', request.project_id)
    .where('status', 'in', [...ACTIVE_CRAWL])
    .executeTakeFirst();
  if (existing) crawlError('Project already has an active crawl', 'crawl_already_active', 409);
  const { root, domain } = projectWebsiteRoot(project.website_url);
  const scope = {
    domain,
    include: normalizeGlobs(request.include_globs),
    exclude: normalizeGlobs(request.exclude_globs),
  };
  if (!classifyUrlAdmission(root, scope).accepted)
    crawlError('crawl root is not admissible', 'invalid_root');
  const selected = controls(request, await hasDevelopmentWorkspace(db, workspaceId));
  const seeds = [
    ...new Set(
      selected.seeds.map((url) => {
        const decision = classifyUrlAdmission(url, scope);
        if (!decision.accepted || !decision.url)
          crawlError('seed URL is not admissible', decision.reason ?? 'invalid_crawl_request');
        return decision.url;
      }),
    ),
  ];
  const runtime = await admissionRuntime(db, workspaceId);
  const now = new Date();
  const requested =
    runtime.discovery_url_cap == null
      ? selected.limit
      : Math.min(selected.limit, runtime.discovery_url_cap);
  const budget = await budgetedPageLimit(db, workspaceId, requested, now);
  const profile = await refreshProfile(db, workspaceId, request.project_id, root, scope);
  const configuration = frozenConfiguration(scope, runtime, {
    ...selected,
    limit: budget.limit,
    seeds,
  });
  if (runtime.discovery_mode !== 'sample') {
    const previous = await db
      .selectFrom('site_crawls')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('project_id', '=', request.project_id)
      .where('sample_mode', '=', false)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    if (previous)
      configuration[policy.site_health.reads.inventory_source_crawl_ids_key] = inventoryCrawlIds(
        previous,
      ).slice(0, Number(crawlSetting('inventory_history_crawl_limit')));
  }
  const crawl = await insertCrawl(db, {
    workspaceId,
    projectId: request.project_id,
    profileId: profile.id,
    root,
    configuration,
    runtime,
    seed: request.seed,
    rerun: false,
  });
  if (budget.accountId) await reserveCrawlFetches(db, crawl, budget.accountId, budget.limit, now);
  const initial = (selected.mode === 'exact_urls' ? seeds : [root, ...seeds]).slice(
    0,
    budget.limit,
  );
  await Promise.all(
    [...new Set(initial)].map((url, position) =>
      enqueueCrawlTask(db, crawl, { kind: 'discover', url, position }),
    ),
  );
  await enqueueCrawlTask(db, crawl, {
    kind: 'site_setup',
    url: root,
    priority: policy.site_health.crawl.site_setup_priority_boost,
    position: -1,
  });
  await seedMonitored(db, crawl);
  if (selected.mode === 'auto') await addAutomaticRoot(db, crawl, runtime);
  await creationEvents(db, crawl);
  return crawl;
}

/** Project/runtime/profile are already locked by rerun admission; reuse that frozen scope. */
export async function createPageRerunCrawl(
  db: Database,
  workspaceId: string,
  projectId: string,
  profile: Profile,
  url: Selectable<SiteUrls>,
  runtime: Runtime,
) {
  const scope = {
    domain: profile.registrable_domain || undefined,
    include: strings(profile.include_globs),
    exclude: strings(profile.exclude_globs),
  };
  const decision = classifyUrlAdmission(url.normalized_url, scope);
  if (!decision.accepted)
    crawlError('page is not admissible for rerun', decision.reason ?? 'invalid_crawl_request');
  const now = new Date();
  const budget = await budgetedPageLimit(db, workspaceId, 1, now);
  const configuration = frozenConfiguration(scope, runtime, {
    mode: 'auto',
    limit: budget.limit,
    seeds: [],
    kinds: [],
  });
  const crawl = await insertCrawl(db, {
    workspaceId,
    projectId,
    profileId: profile.id,
    root: profile.root_url || url.normalized_url,
    configuration,
    runtime,
    rerun: true,
  });
  if (budget.accountId) await reserveCrawlFetches(db, crawl, budget.accountId, budget.limit, now);
  await seedObservation(db, crawl, url, true);
  await enqueueCrawlTask(db, crawl, {
    kind: 'analyze',
    url: url.normalized_url,
    siteUrlId: url.id,
  });
  await creationEvents(db, crawl, url.id);
  return crawl;
}
