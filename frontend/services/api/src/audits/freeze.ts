import { createHash, randomBytes } from 'node:crypto';
import { shuffleAuditSlots } from './slot-order.ts';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import { providerPolicy, type Engine, type ProviderSettings } from '../providers/config.ts';
import { approvedEndpoint } from '../providers/connections.ts';
import { auditPolicy, auditSettings } from './config.ts';
import type { AuditInput } from './inputs.ts';
import { freezeCommerceContext } from '../commerce/audit-context.ts';
import {
  contextSeeds,
  effectiveEntityMatching,
  frozenEntityMatching,
  storedEntityMatching,
} from '../analysis/entity-matching.ts';
import { strings } from '../db/json.ts';
import {
  searchPayload,
  searchPolicy,
  searchSettings,
  type SearchEngine,
} from '../search-surfaces/dataforseo.ts';

const invalid = (message: string) => new ApiError(400, message);
export type FrozenRoute = {
  logical_engine: Engine;
  transport_provider: string;
  transport_model: string;
  connection_id: string | null;
  base_url: string;
};
export async function prepareAudit(
  db: Database,
  workspaceId: string,
  input: AuditInput,
  settings: ReturnType<typeof auditSettings>,
  providerSettings: ProviderSettings,
  trigger: string,
  search = searchSettings(),
  at = new Date(),
) {
  trigger = trigger.trim().toLowerCase();
  if (!auditPolicy.constants.audit_triggers.includes(trigger))
    throw invalid(`Unsupported trigger: ${trigger}`);
  const project = await db
    .selectFrom('projects')
    .selectAll()
    .where('id', '=', input.project_id)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (!project) throw notFound('Project');
  const mode = input.benchmark_mode ?? project.benchmark_mode;
  if (!auditPolicy.benchmark_modes.includes(mode))
    throw invalid(`Unsupported benchmark mode: ${mode}`);
  let query = db
    .selectFrom('prompts as p')
    .innerJoin('prompt_sets as s', 's.id', 'p.prompt_set_id')
    .innerJoin('projects as project', 'project.id', 's.project_id')
    .selectAll('p')
    .where('project.workspace_id', '=', workspaceId)
    .where('project.id', '=', project.id)
    .where('p.enabled', '=', true)
    .where('p.status', '=', 'active')
    .orderBy('p.created_at')
    .orderBy('p.id');
  if (input.prompt_ids.length) query = query.where('p.id', 'in', input.prompt_ids);
  else if (input.prompt_set_id) query = query.where('p.prompt_set_id', '=', input.prompt_set_id);
  else throw invalid('Select a prompt set or prompt IDs');
  const prompts = await query.execute();
  if (input.prompt_ids.length && new Set(input.prompt_ids).size !== prompts.length)
    throw invalid('Selected prompts must be active, enabled and in this project');
  if (!prompts.length) throw invalid('No enabled prompts to audit');
  if (prompts.some((prompt) => Array.from(prompt.text).length > settings.max_prompt_chars))
    throw invalid('Selected prompts exceed the configured length limit');
  const engines = [...new Set(input.engines)];
  if (engines.some((engine) => !auditPolicy.selectable_engines.includes(engine)))
    throw invalid('An engine is unavailable');
  if (input.credential_mode === 'funded' || trigger === 'trial') {
    if (settings.audit_prompt_count === null)
      throw new ApiError(422, 'Audit prompt-count policy is unconfigured', {
        code: 'prompt_count_policy_unconfigured',
      });
    if (prompts.length > settings.audit_prompt_count)
      throw new ApiError(403, 'Too many selected prompts', { code: 'prompt_count_exceeded' });
  }
  const repetitions = input.repetitions ?? settings.audit_repetitions;
  if (
    !Number.isSafeInteger(repetitions) ||
    repetitions < auditPolicy.min_repetitions ||
    repetitions > auditPolicy.max_repetitions
  )
    throw invalid('Repetition count is outside the configured bounds');
  if (prompts.length * repetitions * engines.length > settings.max_tasks_per_audit)
    throw invalid('Audit exceeds the task limit');
  const candidates = await db
    .selectFrom('provider_routes as r')
    .innerJoin('provider_connections as c', 'c.id', 'r.connection_id')
    .innerJoin('workspaces as w', 'w.id', 'c.workspace_id')
    .select([
      'r.logical_engine',
      'r.transport_provider',
      'r.transport_model',
      'c.id as connection_id',
      'c.base_url',
      'c.paused_at',
      'c.pause_until',
      'c.last_test_status',
      sql<boolean>`c.api_key_encrypted <> ''`.as('has_key'),
    ])
    .where('r.workspace_id', '=', workspaceId)
    .where('c.workspace_id', '=', workspaceId)
    .where('w.is_system', '=', false)
    .where('c.credential_source', '=', 'byok')
    .where('r.active', '=', true)
    .where('c.active', '=', true)
    .orderBy('r.is_default', 'desc')
    .orderBy('r.created_at')
    .orderBy('r.id')
    .execute();
  const routes: FrozenRoute[] = [];
  for (const engine of engines) {
    const catalog = providerPolicy.routes[engine];
    const observed = catalog.transport_provider === 'dataforseo';
    if (input.credential_mode === 'funded' && observed)
      throw invalid('Search surfaces require your own DataForSEO credentials');
    const selected = candidates.find((candidate) => {
      if (
        candidate.logical_engine !== engine ||
        candidate.transport_provider !== catalog.transport_provider
      )
        return false;
      if (
        !candidate.has_key ||
        candidate.last_test_status !== 'ok' ||
        (candidate.paused_at !== null &&
          (candidate.pause_until === null || candidate.pause_until > at))
      )
        return false;
      try {
        approvedEndpoint(candidate.transport_provider, candidate.base_url, providerSettings);
        return true;
      } catch {
        return false;
      }
    });
    if (input.credential_mode === 'byok' && !selected)
      throw new ApiError(400, `No active provider route configured for ${engine}`, {
        code: 'execution_credentials_unavailable',
      });
    routes.push({
      logical_engine: engine,
      transport_provider: catalog.transport_provider,
      transport_model: catalog.transport_model,
      connection_id: selected?.connection_id ?? null,
      base_url: selected?.base_url ?? '',
    });
    if (observed)
      for (const prompt of prompts)
        searchPayload(engine as SearchEngine, {
          query: prompt.text,
          location_code: project.serp_location_code,
          language_code: project.serp_language_code || searchPolicy.constants.default_language_code,
          device: project.serp_device as 'desktop' | 'mobile',
          depth: searchPolicy.constants.default_depth,
          load_async_ai_overview: searchPolicy.constants.load_async_ai_overview,
          timeout_seconds: settings.audit_timeout_seconds,
          provider_submission_ref: 'admission-validation',
          request_settings: {},
        });
  }
  const brand = await db
    .selectFrom('brands')
    .selectAll()
    .where('project_id', '=', project.id)
    .executeTakeFirst();
  const [aliases, owned, unintended, competitors, profile] = await Promise.all([
    brand
      ? db
          .selectFrom('brand_aliases')
          .select('alias')
          .where('brand_id', '=', brand.id)
          .orderBy('id')
          .execute()
      : [],
    db
      .selectFrom('owned_domains')
      .select('domain')
      .where('project_id', '=', project.id)
      .orderBy('id')
      .execute(),
    db
      .selectFrom('unintended_domains')
      .select('domain')
      .where('project_id', '=', project.id)
      .orderBy('id')
      .execute(),
    db
      .selectFrom('competitors')
      .select(['name', 'aliases', 'domains'])
      .where('project_id', '=', project.id)
      .orderBy('id')
      .execute(),
    db
      .selectFrom('brand_profiles')
      .select(['products_services', 'business_context'])
      .where('workspace_id', '=', workspaceId)
      .where('project_id', '=', project.id)
      .executeTakeFirst(),
  ]);
  const localized = auditPolicy.constants.localized_instruction
    .replace('{country_code}', project.country_code || 'unspecified')
    .replace('{language_code}', project.language_code || 'unspecified');
  const framing =
    mode === 'consumer_like'
      ? ''
      : mode === 'controlled_localized'
        ? localized
        : `${localized} ${auditPolicy.constants.forced_grounded_instruction}`;
  const systemInstruction = [framing, auditPolicy.constants.audit_answer_instruction]
    .filter(Boolean)
    .join(' ');
  const measurement = {
    retrieval_enabled: true,
    max_output_tokens: settings.audit_max_output_tokens,
    timeout_seconds: settings.audit_timeout_seconds,
    repetitions: settings.audit_repetitions,
    answer_instruction: auditPolicy.constants.audit_answer_instruction,
    max_attempts: settings.max_attempts,
  };
  const promptRows = prompts.map((prompt) => ({
    text: prompt.text,
    theme: prompt.theme,
    intent: prompt.intent,
    buyer_stage: prompt.buyer_stage,
    prompt_intent: prompt.prompt_intent,
    cohort: prompt.cohort,
  }));
  // Preserve the existing panel identity (Python sorted keys, UTF-8, default separators).
  const panelJson = `[${promptRows
    .map(
      (row) =>
        `{${Object.entries(row)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
          .join(', ')}}`,
    )
    .join(', ')}]`;
  const panelHash = createHash('sha256').update(panelJson).digest('hex');
  let seed: string;
  if (input.random_seed?.trim() && !/^[+-]?\d+$/u.test(input.random_seed.trim()))
    throw invalid('random_seed must be an integer');
  try {
    seed = input.random_seed?.trim()
      ? BigInt.asUintN(64, BigInt(input.random_seed.trim())).toString()
      : randomBytes(8).readBigUInt64BE().toString();
  } catch {
    throw invalid('random_seed must be an integer');
  }
  const configuration = {
    brand_name: brand?.name ?? project.brand_name,
    brand_aliases: aliases.map((row) => row.alias),
    owned_domains: owned.map((row) => row.domain),
    unintended_domains: unintended.map((row) => row.domain),
    competitors,
    products_services: profile?.products_services ?? [],
    // Analysis matches names under this frozen policy, never the live one.
    entity_matching: frozenEntityMatching(
      effectiveEntityMatching(
        storedEntityMatching(profile?.business_context),
        [
          {
            name: brand?.name ?? project.brand_name,
            aliases: aliases.map((row) => row.alias),
          },
          ...competitors.map((row) => ({ name: row.name, aliases: strings(row.aliases) })),
        ],
        contextSeeds(profile?.business_context, strings(profile?.products_services)),
      ),
    ),
    country_code: project.country_code,
    language_code: project.language_code,
    audit_scope: input.audit_scope,
    trigger,
    benchmark_mode: mode,
    measurement_policy: measurement,
    system_instruction: systemInstruction,
    engines,
    repetitions,
    max_attempts: settings.max_attempts,
    max_run_seconds: settings.max_run_seconds,
    request_timeout_seconds: settings.audit_timeout_seconds,
    anthropic_max_uses: providerSettings.anthropicMaxUses,
    slot_order_version: 'python-mt19937-v1',
    panel_id: panelHash.slice(0, 16),
    panel_hash: panelHash,
    prompt_hashes: promptRows.map((row) => createHash('sha256').update(row.text).digest('hex')),
    engine_routes: Object.fromEntries(
      routes.map((route) => [
        route.logical_engine,
        { ...route, ...auditPolicy.route_policies[route.logical_engine] },
      ]),
    ),
    ...(input.audit_scope === 'commerce'
      ? {
          commerce_measurement: await freezeCommerceContext(
            db,
            { workspaceId, projectId: project.id },
            prompts.map((prompt) => prompt.id),
          ),
        }
      : {}),
  };
  return {
    project,
    prompts,
    routes,
    configuration,
    measurement,
    mode,
    repetitions,
    seed,
    systemInstruction,
    recoveryDeadlineHours: search.recoveryDeadlineHours,
    searchTimeoutSeconds: search.timeoutSeconds,
  };
}
/** Preserve the integer-seeded Python slot order, including unsigned 64-bit seeds. */
export function auditSlots(
  prompts: number,
  engines: readonly Engine[],
  repetitions: number,
  seed: string,
) {
  return shuffleAuditSlots(
    Array.from({ length: prompts }, (_, prompt) =>
      engines.flatMap((engine) =>
        Array.from({ length: repetitions }, (_, repetition) => ({
          prompt,
          engine,
          repetition,
        })),
      ),
    ).flat(),
    seed,
  );
}
