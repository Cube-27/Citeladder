/**
 * The probe bar and the Run probe dialog: what a probe would ask and charge
 * before anything runs (AV-34), the newest probe's state, its schedule, and
 * the launch itself through the one audit admission owner.
 */
import { auditScheduleCadenceSchema } from '@citeladder/contracts/audits';
import type { ProbeQuote, ProbeStatus } from '@citeladder/contracts/probes';

import { auditRuntime, auditPolicy, type AuditRuntime } from '../audits/config.ts';
import { createAudits } from '../audits/creation.ts';
import { byokRoutes, marketEngines, usableRoute } from '../audits/freeze.ts';
import { probeAnswerCredits } from '../audits/prompt-runs.ts';
import { workspaceCredentialMode } from '../billing/credential-mode.ts';
import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { billingAccountId, LedgerError, remaining } from '../entitlements/ledger.ts';
import { ApiError, notFound } from '../errors.ts';
import { listMarkets } from '../projects/markets.ts';
import type { Engine } from '../providers/config.ts';
import { searchContext } from '../search-surfaces/locations.ts';
import { probeLaunches } from './launches.ts';
import { probeSubject, probeQuestions } from './questions.ts';

type Scope = { workspaceId: string; projectId: string };
const probes = policy.probes;

/** AI credits the account can spend now; null when no balance is readable. */
async function aiCreditBalance(db: Database, workspaceId: string, at: Date) {
  return inTransaction(db, async (trx) => {
    const accountId = await billingAccountId(trx, workspaceId);
    if (!accountId) return null;
    try {
      const { units } = await remaining(trx, {
        accountId,
        workspaceId,
        capability: policy.entitlements.ai_credits,
        at,
      });
      return units;
    } catch (error) {
      if (error instanceof LedgerError) return null;
      throw error;
    }
  });
}

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

/** What Run probe would ask every engine in every market, and its exact AI-credit cost. */
async function probeQuote(
  db: Database,
  scope: Scope,
  { runtime = auditRuntime(), at = new Date() }: { runtime?: AuditRuntime; at?: Date } = {},
): Promise<ProbeQuote> {
  const funded = (await workspaceCredentialMode(db, scope.workspaceId)) === 'funded';
  const [engines, markets, subject, balance] = await Promise.all([
    probeEngineList(db, scope, { funded, runtime, at }),
    listMarkets(db, scope),
    probeSubject(db, scope),
    aiCreditBalance(db, scope.workspaceId, at),
  ]);
  const questions = probeQuestions(subject).length;
  let answers = 0;
  let credits = 0;
  for (const market of markets)
    for (const engine of engines) {
      if (!measures(engine, market)) continue;
      answers += questions * probes.repetitions;
      credits += questions * probes.repetitions * probeAnswerCredits(engine, !funded);
    }
  return {
    credential_mode: funded ? 'funded' : 'byok',
    engines,
    markets: markets.map(({ id, country_code, language_code }) => ({
      id,
      country_code,
      language_code,
    })),
    questions,
    repetitions: probes.repetitions,
    answers,
    credits,
    balance,
  };
}

/** Whether `engine` can measure `market` (admission refuses or skips it otherwise). */
function measures(
  engine: Engine,
  market: { id: string | null; country_code: string; language_code: string },
) {
  try {
    return (
      marketEngines([engine], market, searchContext(market.country_code, market.language_code))
        .engines.length > 0
    );
  } catch {
    return false;
  }
}

/** The probe bar: the quote, the newest launch and the probe schedule. */
export async function probeStatus(db: Database, scope: Scope): Promise<ProbeStatus> {
  const [quote, [latest], schedule] = await Promise.all([
    probeQuote(db, scope),
    probeLaunches(db, scope, { limit: 1 }),
    db
      .selectFrom('audit_schedules')
      .select(['id', 'cadence', 'enabled', 'next_run_at'])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('audit_scope', '=', probes.audit_scope)
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .executeTakeFirst(),
  ]);
  return {
    quote,
    latest: latest?.run ?? null,
    schedule: schedule
      ? {
          id: schedule.id,
          cadence: auditScheduleCadenceSchema.parse(schedule.cadence),
          enabled: schedule.enabled,
          next_run_at: schedule.next_run_at?.toISOString() ?? null,
        }
      : null,
  };
}

/** The project's prompt set: a probe launch names it because every launch does. */
async function promptSetOf(db: Database, scope: Scope) {
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

/** What a probe launch names: the usable probe engines and the project's prompt set. */
export async function probeLaunchPlan(db: Database, scope: Scope, runtime: AuditRuntime) {
  const funded = (await workspaceCredentialMode(db, scope.workspaceId)) === 'funded';
  const engines = await probeEngineList(db, scope, { funded, runtime, at: new Date() });
  if (!engines.length)
    throw new ApiError(400, 'Add a key for a search-capable engine to run a probe', {
      code: 'execution_credentials_unavailable',
    });
  return { engines, promptSetId: await promptSetOf(db, scope) };
}

/** Launches a probe in every market on every usable probe engine; returns the run ids. */
export async function runProbe(db: Database, scope: Scope, runtime: AuditRuntime = auditRuntime()) {
  const plan = await probeLaunchPlan(db, scope, runtime);
  const markets = await listMarkets(db, scope);
  return createAudits(
    db,
    scope.workspaceId,
    {
      project_id: scope.projectId,
      prompt_set_id: plan.promptSetId,
      prompt_ids: [],
      engines: plan.engines,
      market_ids: markets.map((market) => market.id),
      audit_scope: probes.audit_scope,
    },
    {},
    runtime,
  );
}
