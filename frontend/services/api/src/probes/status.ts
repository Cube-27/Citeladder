import { auditScheduleCadenceSchema } from '@citeladder/contracts/audits';
import type { ProbeQuote, ProbeStatus, probeRunsSchema } from '@citeladder/contracts/probes';
import type { z } from 'zod';

import type { AuditRuntime } from '../audits/config.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { ProjectScope as Scope } from '../projects/brand-profile.ts';
import { grantBalances } from '../entitlements/ledger.ts';
import { loadAccountState } from '../entitlements/state.ts';
import { probeLaunches } from './launches.ts';
import { blockedBy, probePlan, type ProbeChoice } from './plan.ts';
import { probeSchedules } from './schedule.ts';
const probes = policy.probes;

async function aiCreditBalance(db: Database, workspaceId: string, at: Date) {
  const state = await loadAccountState(db, workspaceId, at);
  if (!state || state.error) return null;
  const grants = state.selected.filter((grant) => grant.key === policy.entitlements.ai_credits);
  const balances = await grantBalances(db, state.account.id, grants);
  return [...balances.values()].reduce((sum, balance) => sum + balance.remaining, 0);
}

async function probeQuote(
  db: Database,
  scope: Scope,
  { runtime, ...choice }: ProbeChoice & { runtime: AuditRuntime },
): Promise<ProbeQuote> {
  const at = new Date();
  const [plan, balance] = await Promise.all([
    probePlan(db, scope, { runtime, at, ...choice }),
    aiCreditBalance(db, scope.workspaceId, at),
  ]);
  return {
    credential_mode: plan.funded ? 'funded' : 'byok',
    engines: plan.engines,
    available_engines: plan.available,
    blocked: blockedBy(plan),
    markets: plan.runs.map((run) => run.market),
    questions: plan.questions,
    repetitions: plan.repetitions,
    max_repetitions: probes.max_repetitions,
    answers: plan.answers,
    credits: plan.credits,
    balance,
    fingerprint: plan.fingerprint,
  };
}

export async function probeRuns(
  db: Database,
  scope: Scope,
): Promise<z.infer<typeof probeRunsSchema>> {
  const [[latest], schedule] = await Promise.all([
    probeLaunches(db, scope, { limit: 1 }),
    probeSchedules(db, scope)
      .select(['id', 'cadence', 'enabled', 'next_run_at'])
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .executeTakeFirst(),
  ]);
  return {
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

export async function probeStatus(
  db: Database,
  scope: Scope,
  runtime: AuditRuntime,
  choice: ProbeChoice = {},
): Promise<ProbeStatus> {
  const [quote, runs] = await Promise.all([
    probeQuote(db, scope, { runtime, ...choice }),
    probeRuns(db, scope),
  ]);
  return { quote, ...runs };
}
