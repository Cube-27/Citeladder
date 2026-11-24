import { createHash } from 'node:crypto';

import { auditPolicy, type AuditRuntime } from '../audits/config.ts';
import { createAuditsInTransaction } from '../audits/creation.ts';
import { byokRoutes, canMeasure, usableRoute } from '../audits/freeze.ts';
import { probeAnswerCredits } from '../audits/prompt-runs.ts';
import { workspaceCredentialMode } from '../billing/credential-mode.ts';
import { workspaceAccess } from '../entitlements/access.ts';
import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import type { ProjectScope as Scope } from '../projects/brand-profile.ts';
import { listMarkets } from '../projects/markets.ts';
import { countryName, probeQuestions, probeSubject } from './questions.ts';

const probes = policy.probes;

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

export type ProbeChoice = {
  engines?: readonly string[];
  repetitions?: number;
  web_search?: boolean;
};
type PlanInput = ProbeChoice & { runtime: AuditRuntime; at: Date };

function chosenRepetitions(repetitions: number | undefined) {
  if (repetitions === undefined) return probes.repetitions;
  if (repetitions < 1 || repetitions > probes.max_repetitions)
    throw new ApiError(422, `Choose between 1 and ${probes.max_repetitions} repetitions`, {
      code: 'probe_repetitions_invalid',
    });
  return repetitions;
}

export async function probePlan(
  db: Database,
  scope: Scope,
  { runtime, at, engines: picked, repetitions: requested }: PlanInput,
) {
  const repetitions = chosenRepetitions(requested);
  const funded = (await workspaceCredentialMode(db, scope.workspaceId)) === 'funded';
  const [usable, markets, subject, access] = await Promise.all([
    probeEngineList(db, scope, { funded, runtime, at }),
    listMarkets(db, scope),
    probeSubject(db, scope),
    workspaceAccess(db, scope.workspaceId, at),
  ]);
  const measured = markets.map(({ id, country_code, language_code }) => {
    const market = { id, country_code, language_code };
    return { market, engines: usable.filter((engine) => canMeasure(engine, market)) };
  });
  const available = usable.filter((engine) => measured.some((run) => run.engines.includes(engine)));
  if (picked && !available.some((engine) => picked.includes(engine)))
    throw new ApiError(422, 'Choose at least one engine the probe can ask', {
      code: 'probe_engines_unavailable',
    });
  const runs = measured.flatMap(({ market, engines: all }) => {
    const { country_code } = market;
    const engines = picked ? all.filter((engine) => picked.includes(engine)) : all;
    const questions = probeQuestions({
      ...subject,
      country: countryName(country_code),
      webSearch: false,
    });
    return engines.length ? [{ market, engines, questions: questions.map((q) => q.text) }] : [];
  });
  const questions = probeQuestions({ ...subject, country: '', webSearch: false }).length;
  const asks = questions * repetitions;
  let credits = 0;
  for (const run of runs)
    for (const engine of run.engines) credits += asks * probeAnswerCredits(engine, !funded);
  const engines = usable.filter((engine) => runs.some((run) => run.engines.includes(engine)));
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ funded, repetitions, runs, credits }))
    .digest('hex');
  return {
    funded,
    trial: access.status === 'trial_active',
    overLimit: runs.some(
      (run) =>
        run.questions.length * repetitions * run.engines.length >
        runtime.audits.max_tasks_per_audit,
    ),
    usable,
    available,
    engines,
    runs,
    questions,
    repetitions,
    answers: runs.reduce((sum, run) => sum + run.engines.length * asks, 0),
    credits,
    fingerprint,
  };
}

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

export function blockedBy(plan: Plan) {
  if (plan.trial) return 'trial';
  if (!plan.usable.length) return 'no_key';
  if (!plan.runs.length) return 'no_market';
  return plan.overLimit ? 'task_limit' : null;
}

export function runnable(plan: Plan) {
  const blocked = blockedBy(plan);
  if (blocked === 'trial')
    throw new ApiError(403, 'Market probes are not in the trial', {
      code: 'capability_not_granted',
    });
  if (blocked === 'task_limit')
    throw new ApiError(422, 'The probe asks more than the task limit in a market');
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
  new ApiError(
    409,
    'The probe changed since its AI credits were shown. Check the new figure and run it.',
    {
      code: 'probe_quote_changed',
    },
  );

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

export function runProbe(
  db: Database,
  scope: Scope,
  { fingerprint, ...choice }: ProbeChoice & { fingerprint: string },
  runtime: AuditRuntime,
) {
  return inTransaction(db, async (trx) => {
    const at = new Date();
    const plan = runnable(await probePlan(trx, scope, { runtime, at, ...choice }));
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
        repetitions: plan.repetitions,
        audit_scope: probes.audit_scope,
        probe_web_search: choice.web_search === true,
      },
      {},
      runtime,
      at,
    );
    if ((await heldCredits(trx, scope.workspaceId, ids)) !== plan.credits) throw changed();
    return ids;
  });
}
