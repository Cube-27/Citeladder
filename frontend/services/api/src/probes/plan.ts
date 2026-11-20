/**
 * One probe launch, planned once (AV-34): per market, the usable probe engines
 * that can measure it, the questions asked there and the AI credits held. The
 * quote shows the plan with its fingerprint; Run probe sends that fingerprint
 * back, and the launch refuses rather than charge a plan the user never saw.
 */
import { createHash } from 'node:crypto';

import { auditPolicy, type AuditRuntime } from '../audits/config.ts';
import { createAuditsInTransaction } from '../audits/creation.ts';
import { byokRoutes, canMeasure, usableRoute } from '../audits/freeze.ts';
import { probeAnswerCredits } from '../audits/prompt-runs.ts';
import { workspaceCredentialMode } from '../billing/credential-mode.ts';
import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import type { ProjectScope as Scope } from '../projects/brand-profile.ts';
import { listMarkets } from '../projects/markets.ts';
import { countryName, probeQuestions, probeSubject } from './questions.ts';

const probes = policy.probes;

/** The search-capable engines this workspace can probe on: CiteLadder's, or its own usable keys. */
async function probeEngineList(
  db: Database,
  scope: Scope,
  input: { funded: boolean; runtime: AuditRuntime; at: Date },
) {
  const offered = probes.engines.filter((engine) =>
    auditPolicy.selectable_engines.includes(engine),
  );
  if (input.funded) return offered;
  const candidates = await byokRoutes(db, scope.workspaceId);
  return offered.filter((engine) =>
    usableRoute(candidates, engine, { providerSettings: input.runtime.providers, at: input.at }),
  );
}

/** What a probe launched now would ask and hold, market by market. */
export async function probePlan(
  db: Database,
  scope: Scope,
  { runtime, at }: { runtime: AuditRuntime; at: Date },
) {
  const funded = (await workspaceCredentialMode(db, scope.workspaceId)) === 'funded';
  const [usable, markets, subject] = await Promise.all([
    probeEngineList(db, scope, { funded, runtime, at }),
    listMarkets(db, scope),
    probeSubject(db, scope),
  ]);
  // An engine that cannot measure a market is skipped there, never the whole probe.
  const runs = markets.flatMap(({ id, country_code, language_code }) => {
    const market = { id, country_code, language_code };
    const engines = usable.filter((engine) => canMeasure(engine, market));
    const questions = probeQuestions({ ...subject, country: countryName(country_code) });
    return engines.length ? [{ market, engines, questions: questions.map((q) => q.text) }] : [];
  });
  // Every market asks the same questions, only its country differs.
  const questions = probeQuestions({ ...subject, country: '' }).length;
  const asks = questions * probes.repetitions;
  let credits = 0;
  for (const run of runs)
    for (const engine of run.engines) credits += asks * probeAnswerCredits(engine, !funded);
  const engines = usable.filter((engine) => runs.some((run) => run.engines.includes(engine)));
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ funded, repetitions: probes.repetitions, runs, credits }))
    .digest('hex');
  return {
    funded,
    usable,
    engines,
    runs,
    questions,
    answers: runs.reduce((sum, run) => sum + run.engines.length * asks, 0),
    credits,
    fingerprint,
  };
}

/** The project's prompt set: a probe launch names it because every launch does. */
export async function promptSetOf(db: Database, scope: Scope) {
  const set = await db
    .selectFrom('prompt_sets')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at')
    .orderBy('id')
    .executeTakeFirst();
  if (!set) throw notFound('Prompt set');
  return set.id;
}

type Plan = Awaited<ReturnType<typeof probePlan>>;

/** Why a plan would run nothing: no usable key, or no usable engine measures any market. */
export function blockedBy(plan: Plan) {
  if (!plan.usable.length) return 'no_key';
  return plan.runs.length ? null : 'no_market';
}

/** A plan with at least one engine in one market, or why there is none. */
export function runnable(plan: Plan) {
  const blocked = blockedBy(plan);
  if (blocked === 'no_key')
    throw new ApiError(400, 'Add a key for a search-capable engine to run a probe', {
      code: 'execution_credentials_unavailable',
    });
  if (blocked === 'no_market')
    throw new ApiError(422, 'No probe engine can measure any of the project’s markets', {
      code: 'market_unsupported',
    });
  return plan;
}

export const changed = () =>
  new ApiError(409, 'The probe changed since its cost was shown. Check the new cost and run it.', {
    code: 'probe_quote_changed',
  });

/** AI credits the launch's new tasks hold. */
async function heldCredits(db: Database, workspaceId: string, auditIds: readonly string[]) {
  const row = await db
    .selectFrom('consumable_ledger')
    .select(({ fn }) => fn.sum<string>('units').as('units'))
    .where('workspace_id', '=', workspaceId)
    .where('capability_key', '=', policy.entitlements.ai_credits)
    .where('entry_kind', '=', 'reservation')
    .where('subject_kind', '=', 'audit')
    .where('subject_id', 'in', (query) =>
      query.selectFrom('audit_tasks').select('id').where('audit_id', 'in', auditIds),
    )
    .executeTakeFirst();
  return Number(row?.units ?? 0);
}

/**
 * Launches the quoted probe: one run per market on the engines that measure
 * it. Refuses `probe_quote_changed` when the plan is no longer the quoted one,
 * or when admission would hold a different number of credits, rolling back.
 */
export function runProbe(
  db: Database,
  scope: Scope,
  { fingerprint }: { fingerprint: string },
  runtime: AuditRuntime,
) {
  return inTransaction(db, async (trx) => {
    const at = new Date();
    const plan = runnable(await probePlan(trx, scope, { runtime, at }));
    if (plan.fingerprint !== fingerprint) throw changed();
    const ids = await createAuditsInTransaction(
      trx,
      scope.workspaceId,
      {
        project_id: scope.projectId,
        prompt_set_id: await promptSetOf(trx, scope),
        prompt_ids: [],
        engines: plan.engines,
        market_ids: plan.runs.map((run) => run.market.id),
        audit_scope: probes.audit_scope,
      },
      {},
      runtime,
      at,
    );
    if ((await heldCredits(trx, scope.workspaceId, ids)) !== plan.credits) throw changed();
    return ids;
  });
}
